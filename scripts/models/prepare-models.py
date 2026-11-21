"""Prepare, quantize, and verify ONNX models for Ghadhul Bashar (غض البصر).

Models prepared into apps/extension/public/models/:
  1. nudenet-320n.quant.onnx     (MIT, 18 body-part & face boxes, 320x320 RGB)
  2. yunet-2023mar.onnx          (MIT, OpenCV Zoo small/angled face detector)
  3. agr0013-age-gender.quant.onnx (Apache-2.0, Intel OMZ age [0..100] + gender)
  4. marqo-nsfw-tiny.quant.onnx  (Apache-2.0, ViT-Tiny NSFW/manga/close-up check)

Every exported model accepts raw canvas RGBA uint8 [1, H, W, 4] directly on
input `pixels`, eliminating slow JavaScript pixel permutation loops.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic

from openvino_ir_to_onnx import convert_openvino_ir

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / ".model-cache"
OUT_DIR = ROOT / "apps" / "extension" / "public" / "models"

SOURCES = {
    "nudenet": [
        "https://huggingface.co/zhangsongbo365/nudenet_onnx/resolve/main/320n.onnx",
        "https://github.com/notAI-tech/NudeNet/releases/download/v3.4-weights/320n.onnx",
    ],
    "yunet": [
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    ],
    "agr_xml": [
        "https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/age-gender-recognition-retail-0013/FP32/age-gender-recognition-retail-0013.xml",
        "https://storage.openvinotoolkit.org/repositories/open_model_zoo/2022.1/models_bin/2/age-gender-recognition-retail-0013/FP32/age-gender-recognition-retail-0013.xml",
    ],
    "agr_bin": [
        "https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/age-gender-recognition-retail-0013/FP32/age-gender-recognition-retail-0013.bin",
        "https://storage.openvinotoolkit.org/repositories/open_model_zoo/2022.1/models_bin/2/age-gender-recognition-retail-0013/FP32/age-gender-recognition-retail-0013.bin",
    ],
    "marqo": [
        "https://raw.githubusercontent.com/mohamedsadiqaguenaou/NoHaram/main/src/models/marqo-nsfw-384.onnx",
    ],
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def fetch_with_fallback(urls: list[str], dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    for url in urls:
        try:
            print(f"Downloading {url} -> {dest.name}")
            req = urllib.request.Request(url, headers={"User-Agent": "ghadhul-bashar-model-prep/1.0"})
            part = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(req, timeout=180) as resp:
                ctype = (resp.headers.get("Content-Type") or "").lower()
                if "text/html" in ctype:
                    raise RuntimeError(f"Unexpected HTML response from {url}")
                with part.open("wb") as out:
                    while chunk := resp.read(1 << 20):
                        out.write(chunk)
            if dest.suffix == ".onnx":
                head = part.read_bytes()[:64]
                if b"<html" in head.lower() or b"<!doctype" in head.lower():
                    part.unlink(missing_ok=True)
                    raise RuntimeError(f"Downloaded HTML instead of ONNX from {url}")
            part.replace(dest)
            return dest
        except Exception as err:  # pragma: no cover - network fallback
            last_err = err
            print(f"  mirror failed ({err}), trying fallback...", file=sys.stderr)
    raise RuntimeError(f"Failed downloading {dest.name}: {last_err}")


def prepend_rgba_input(
    model: onnx.ModelProto,
    old_input_name: str,
    bgr: bool,
    scale: float,
    height_dim: int | str,
    width_dim: int | str,
) -> onnx.ModelProto:
    """Wrap float NCHW input with uint8 RGBA [1, H, W, 4] `pixels` input."""
    graph = model.graph
    old_input = next(i for i in graph.input if i.name == old_input_name)
    graph.input.remove(old_input)
    graph.input.insert(
        0,
        helper.make_tensor_value_info(
            "pixels", TensorProto.UINT8, [1, height_dim, width_dim, 4]
        ),
    )

    order = [2, 1, 0] if bgr else [0, 1, 2]
    graph.initializer.append(
        numpy_helper.from_array(np.array(order, dtype=np.int64), "gb_rgb_order")
    )
    trans_out = old_input_name if scale == 1.0 else "gb_nchw_unscaled"
    nodes = [
        helper.make_node("Cast", ["pixels"], ["gb_f32"], to=TensorProto.FLOAT, name="gb_cast"),
        helper.make_node(
            "Gather", ["gb_f32", "gb_rgb_order"], ["gb_rgb"], axis=3, name="gb_gather"
        ),
        helper.make_node(
            "Transpose", ["gb_rgb"], [trans_out], perm=[0, 3, 1, 2], name="gb_transpose"
        ),
    ]
    if scale != 1.0:
        graph.initializer.append(
            numpy_helper.from_array(np.array(scale, dtype=np.float32), "gb_scale")
        )
        nodes.append(
            helper.make_node("Mul", [trans_out, "gb_scale"], [old_input_name], name="gb_mul")
        )

    for idx, node in enumerate(nodes):
        graph.node.insert(idx, node)

    del graph.value_info[:]
    onnx.checker.check_model(model)
    return model


def strip_dynamic_spatial(model: onnx.ModelProto) -> onnx.ModelProto:
    del model.graph.value_info[:]
    for inp in model.graph.input:
        for idx, dim in enumerate(inp.type.tensor_type.shape.dim):
            if idx >= 2 and dim.HasField("dim_value"):
                dim.ClearField("dim_value")
                dim.dim_param = f"in_{idx}"
    for out in model.graph.output:
        for idx, dim in enumerate(out.type.tensor_type.shape.dim):
            if idx > 0 and dim.HasField("dim_value"):
                dim.ClearField("dim_value")
                dim.dim_param = f"{out.name}_d{idx}"
    return model


def optimize_onnx_for_wasm_xnnpack(model: onnx.ModelProto) -> onnx.ModelProto:
    """Convert scalar-loop ConvInteger/MatMulInteger + large FP32 weights into
    FP16-packed initializers with Cast(FLOAT) -> Conv/MatMul so onnxruntime-web
    WASM folds them into fast XNNPACK SIMD128 kernels while staying <22 MB.
    Idempotent on already-optimized models.
    """
    g = model.graph
    has_qint = any(n.op_type in ("ConvInteger", "MatMulInteger") for n in g.node)
    has_large_f32 = any(
        init.data_type == TensorProto.FLOAT
        and not init.name.startswith("gb_")
        and len(init.dims) >= 2
        and int(np.prod(init.dims)) >= 2048
        for init in g.initializer
    )
    if not has_qint and not has_large_f32:
        return model

    inits = {i.name: numpy_helper.to_array(i) for i in g.initializer}
    dql_map = {
        n.output[0]: n.input[0]
        for n in g.node
        if n.op_type == "DynamicQuantizeLinear"
    }
    out_prod = {o: n for n in g.node for o in n.output}
    consumers: dict[str, list[onnx.NodeProto]] = {}
    for n in g.node:
        for inp in n.input:
            consumers.setdefault(inp, []).append(n)

    new_nodes: list[onnx.NodeProto] = []
    skip_ids: set[int] = set()
    new_inits: list[onnx.TensorProto] = []
    dequant_cache: set[str] = set()

    for n in g.node:
        if id(n) in skip_ids:
            continue
        if n.op_type in ("ConvInteger", "MatMulInteger"):
            x_q, w_q = n.input[0], n.input[1]
            orig_x = dql_map[x_q]
            w_zp = (
                inits[n.input[3]]
                if len(n.input) > 3 and n.input[3] in inits
                else np.array(0, dtype=np.float32)
            )
            cast_n = consumers[n.output[0]][0]
            mul_n = consumers[cast_n.output[0]][0]
            scale_inp = next(inp for inp in mul_n.input if inp != cast_n.output[0])
            scale_prod = out_prod[scale_inp]
            w_scale = next(inits[inp] for inp in scale_prod.input if inp in inits)

            w_arr = inits[w_q].astype(np.float32)
            zp_arr = w_zp.astype(np.float32)
            sc_arr = w_scale.astype(np.float32)
            if n.op_type == "ConvInteger":
                if zp_arr.ndim == 1 and w_arr.ndim == 4:
                    zp_arr = zp_arr.reshape(-1, 1, 1, 1)
                if sc_arr.ndim == 1 and w_arr.ndim == 4:
                    sc_arr = sc_arr.reshape(-1, 1, 1, 1)

            w_f16 = ((w_arr - zp_arr) * sc_arr).astype(np.float16)
            w_f16_name = f"{w_q}_gb_f16"
            w_f32_name = f"{w_q}_gb_f32"
            if w_f32_name not in dequant_cache:
                new_inits.append(numpy_helper.from_array(w_f16, w_f16_name))
                new_nodes.append(
                    helper.make_node(
                        "Cast",
                        [w_f16_name],
                        [w_f32_name],
                        to=TensorProto.FLOAT,
                        name=f"{w_q}_gb_cast",
                    )
                )
                dequant_cache.add(w_f32_name)

            skip_ids.update((id(cast_n), id(mul_n), id(scale_prod)))
            out_name = mul_n.output[0]

            if n.op_type == "ConvInteger":
                conv_inputs = [orig_x, w_f32_name]
                cons_out = consumers.get(out_name, [])
                if len(cons_out) == 1 and cons_out[0].op_type == "Add":
                    add_n = cons_out[0]
                    other = next(inp for inp in add_n.input if inp != out_name)
                    if other in inits and inits[other].size == w_f16.shape[0]:
                        b_name = f"{other}_gb_flat"
                        if b_name not in dequant_cache:
                            new_inits.append(
                                numpy_helper.from_array(
                                    inits[other].reshape(-1).astype(np.float32), b_name
                                )
                            )
                            dequant_cache.add(b_name)
                        conv_inputs.append(b_name)
                        out_name = add_n.output[0]
                        skip_ids.add(id(add_n))
                attrs = {a.name: helper.get_attribute_value(a) for a in n.attribute}
                new_nodes.append(
                    helper.make_node(
                        "Conv", conv_inputs, [out_name], name=f"{n.name}_f32", **attrs
                    )
                )
            else:
                new_nodes.append(
                    helper.make_node(
                        "MatMul", [orig_x, w_f32_name], [out_name], name=f"{n.name}_f32"
                    )
                )
        else:
            new_nodes.append(n)

    new_nodes = [n for n in new_nodes if id(n) not in skip_ids]

    pack_names: set[str] = set()
    extra_casts: list[onnx.NodeProto] = []
    for init in g.initializer:
        if (
            init.data_type == TensorProto.FLOAT
            and not init.name.startswith("gb_")
            and len(init.dims) >= 2
            and int(np.prod(init.dims)) >= 2048
        ):
            arr_f16 = numpy_helper.to_array(init).astype(np.float16)
            f16_name = f"{init.name}_gb_f16"
            new_inits.append(numpy_helper.from_array(arr_f16, f16_name))
            extra_casts.append(
                helper.make_node(
                    "Cast",
                    [f16_name],
                    [init.name],
                    to=TensorProto.FLOAT,
                    name=f"{init.name}_gb_cast",
                )
            )
            pack_names.add(init.name)

    all_nodes = extra_casts + new_nodes
    prod = {o: n for n in all_nodes for o in n.output}
    needed_tensors = {o.name for o in g.output}
    queue = list(needed_tensors)
    kept_set: set[int] = set()
    while queue:
        t = queue.pop()
        node = prod.get(t)
        if node is not None and id(node) not in kept_set:
            kept_set.add(id(node))
            for inp in node.input:
                if inp not in needed_tensors:
                    needed_tensors.add(inp)
                    queue.append(inp)

    final_nodes = [n for n in all_nodes if id(n) in kept_set]
    used_inputs = {inp for n in final_nodes for inp in n.input} | {o.name for o in g.output}
    kept_old_inits = [
        i for i in g.initializer if i.name in used_inputs and i.name not in pack_names
    ]
    kept_new_inits = [i for i in new_inits if i.name in used_inputs]

    del g.node[:]
    g.node.extend(final_nodes)
    del g.initializer[:]
    g.initializer.extend(kept_old_inits + kept_new_inits)
    del g.value_info[:]
    onnx.checker.check_model(model)
    return model


def prepare_nudenet(out_path: Path) -> None:
    raw = fetch_with_fallback(SOURCES["nudenet"], CACHE_DIR / "nudenet_320n.onnx")
    model = onnx.load(str(raw))
    inp_name = model.graph.input[0].name
    wrapped = prepend_rgba_input(model, inp_name, bgr=False, scale=1.0 / 255.0, height_dim=320, width_dim=320)
    wrapped_path = CACHE_DIR / "nudenet_rgba.onnx"
    onnx.save(wrapped, str(wrapped_path))

    # Exclude detection head convs (model.22 / cv2 / cv3 / dfl) to preserve box accuracy.
    exclude_nodes = [
        n.name
        for n in wrapped.graph.node
        if n.name and any(tok in n.name for tok in ("model.22", "cv2", "cv3", "dfl", "gb_"))
    ]
    quant_tmp = CACHE_DIR / "nudenet_qtmp.onnx"
    quantize_dynamic(
        str(wrapped_path),
        str(quant_tmp),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["Conv", "MatMul"],
        nodes_to_exclude=exclude_nodes,
    )
    opt_model = optimize_onnx_for_wasm_xnnpack(onnx.load(str(quant_tmp)))
    onnx.save(opt_model, str(out_path))

    # Sanity compare FP32 vs XNNPACK-optimized on deterministic test pattern
    rng = np.random.default_rng(42)
    sample = rng.integers(0, 255, size=(1, 320, 320, 4), dtype=np.uint8)
    s_fp = ort.InferenceSession(str(wrapped_path), providers=["CPUExecutionProvider"])
    s_q = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
    out_fp = s_fp.run(None, {"pixels": sample})[0]
    out_q = s_q.run(None, {"pixels": sample})[0]
    if out_fp.shape != out_q.shape:
        raise RuntimeError(f"NudeNet shape mismatch: {out_fp.shape} vs {out_q.shape}")
    prob_diff = float(np.max(np.abs(out_fp[0, 4:] - out_q[0, 4:])))
    print(f"  NudeNet 320n XNNPACK FP16 -> {out_path.stat().st_size / 1e6:.2f} MB (max prob delta={prob_diff:.4f})")


def prepare_yunet(out_path: Path) -> None:
    raw = fetch_with_fallback(SOURCES["yunet"], CACHE_DIR / "yunet_raw.onnx")
    model = onnx.load(str(raw))
    inp_name = model.graph.input[0].name
    # OpenCV Zoo YuNet expects float BGR [0..255] NCHW dynamic spatial dims.
    model = strip_dynamic_spatial(model)
    wrapped = prepend_rgba_input(
        model, inp_name, bgr=True, scale=1.0, height_dim="height", width_dim="width"
    )
    onnx.save(wrapped, str(out_path))
    print(f"  YuNet prepared -> {out_path.stat().st_size / 1e6:.2f} MB")


def prepare_agr0013(out_path: Path) -> None:
    xml = fetch_with_fallback(SOURCES["agr_xml"], CACHE_DIR / "agr0013.xml")
    bin_file = fetch_with_fallback(SOURCES["agr_bin"], CACHE_DIR / "agr0013.bin")
    fp32_path = CACHE_DIR / "agr0013_fp32.onnx"
    convert_openvino_ir(
        str(xml),
        str(bin_file),
        str(fp32_path),
        keep_outputs={"prob", "age_conv3"},
        renames={"prob": "gender", "age_conv3": "age"},
    )
    model = onnx.load(str(fp32_path))
    wrapped = prepend_rgba_input(model, "input", bgr=True, scale=1.0, height_dim=62, width_dim=62)
    rgba_path = CACHE_DIR / "agr0013_rgba.onnx"
    onnx.save(wrapped, str(rgba_path))

    # Quantize backbone convs excluding final head convs so age regression remains accurate.
    exclude_nodes = [
        n.name
        for n in wrapped.graph.node
        if n.name and any(tok in n.name for tok in ("age_conv", "fc_conv", "prob", "gb_"))
    ]
    quant_tmp = CACHE_DIR / "agr0013_qtmp.onnx"
    quantize_dynamic(
        str(rgba_path),
        str(quant_tmp),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["Conv"],
        nodes_to_exclude=exclude_nodes,
    )
    opt_model = optimize_onnx_for_wasm_xnnpack(onnx.load(str(quant_tmp)))
    onnx.save(opt_model, str(out_path))
    print(f"  AGR0013 Age+Gender XNNPACK FP16 -> {out_path.stat().st_size / 1e6:.2f} MB")


def prepare_marqo(out_path: Path) -> None:
    raw = fetch_with_fallback(SOURCES["marqo"], CACHE_DIR / "marqo_raw.onnx")
    model = onnx.load(str(raw))
    # Exclude final classification MatMul/Gemm layers from quantization.
    head_nodes = [
        n.name
        for n in model.graph.node
        if n.op_type in ("MatMul", "Gemm")
        and any("head" in x or "classifier" in x for x in (*n.input, n.name))
    ]
    quant_tmp = CACHE_DIR / "marqo_qtmp.onnx"
    quantize_dynamic(
        str(raw),
        str(quant_tmp),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["MatMul", "Gemm"],
        nodes_to_exclude=head_nodes,
    )
    opt_model = optimize_onnx_for_wasm_xnnpack(onnx.load(str(quant_tmp)))
    onnx.save(opt_model, str(out_path))
    # Smoke compare
    sample = np.full((1, 384, 384, 4), 180, dtype=np.uint8)
    s_fp = ort.InferenceSession(str(raw), providers=["CPUExecutionProvider"])
    s_q = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
    inp = s_fp.get_inputs()[0].name
    p_fp = float(s_fp.run(None, {inp: sample})[0].reshape(-1)[0])
    p_q = float(s_q.run(None, {inp: sample})[0].reshape(-1)[0])
    print(f"  Marqo ViT-Tiny NSFW XNNPACK FP16 -> {out_path.stat().st_size / 1e6:.2f} MB (sample delta={abs(p_fp - p_q):.4f})")


def optimize_existing_models() -> None:
    """In-place local optimization of existing bundled models for WASM XNNPACK SIMD128."""
    specs = [
        ("nudenet-320n.quant.onnx", (1, 320, 320, 4)),
        ("agr0013-age-gender.quant.onnx", (1, 62, 62, 4)),
        ("marqo-nsfw-tiny.quant.onnx", (1, 384, 384, 4)),
    ]
    rng = np.random.default_rng(7)
    for filename, shape in specs:
        path = OUT_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing model to optimize: {path}")
        orig_model = onnx.load(str(path))
        opt_model = optimize_onnx_for_wasm_xnnpack(onnx.load(str(path)))
        raw_opt = opt_model.SerializeToString()

        sample = rng.integers(0, 255, size=shape, dtype=np.uint8)
        s_orig = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        s_opt = ort.InferenceSession(raw_opt, providers=["CPUExecutionProvider"])
        inp_name = s_orig.get_inputs()[0].name
        o_orig = s_orig.run(None, {inp_name: sample})
        o_opt = s_opt.run(None, {inp_name: sample})
        for idx, (a, b) in enumerate(zip(o_orig, o_opt)):
            if a.shape != b.shape:
                raise RuntimeError(f"{filename} output[{idx}] shape changed: {a.shape} vs {b.shape}")
            if filename.startswith("nudenet"):
                prob_diff = float(np.max(np.abs(a[0, 4:] - b[0, 4:])))
                if prob_diff > 0.05:
                    raise RuntimeError(f"{filename} prob parity drift too large: {prob_diff:.4f}")
            else:
                diff = float(np.max(np.abs(a - b)))
                if diff > 0.05:
                    raise RuntimeError(f"{filename} output[{idx}] parity drift too large: {diff:.4f}")

        tmp_path = path.with_suffix(".onnx.tmp")
        tmp_path.write_bytes(raw_opt)
        tmp_path.replace(path)
        print(f"[OPTIMIZED] {filename:32s} -> {path.stat().st_size / 1e6:5.2f} MB (XNNPACK FP16)")


def verify_models() -> None:
    specs = [
        ("nudenet-320n.quant.onnx", (1, 320, 320, 4), None),
        ("yunet-2023mar.onnx", (1, 256, 256, 4), None),
        ("agr0013-age-gender.quant.onnx", (1, 62, 62, 4), {"gender", "age"}),
        ("marqo-nsfw-tiny.quant.onnx", (1, 384, 384, 4), {"nsfw"}),
    ]
    total_bytes = 0
    manifest_entries = []

    for filename, shape, expected_outputs in specs:
        path = OUT_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing required model: {path}")
        size = path.stat().st_size
        total_bytes += size
        model = onnx.load(str(path))
        onnx.checker.check_model(model)

        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inputs = sess.get_inputs()
        outputs = [o.name for o in sess.get_outputs()]
        if expected_outputs and not expected_outputs.issubset(set(outputs)):
            raise RuntimeError(f"{filename} missing expected outputs {expected_outputs}; got {outputs}")

        dummy = np.zeros(shape, dtype=np.uint8)
        result = sess.run(None, {inputs[0].name: dummy})
        print(
            f"[VERIFIED] {filename:32s} {size / 1e6:5.2f} MB | in={inputs[0].name}{shape} | outputs={[(o, tuple(r.shape)) for o, r in zip(outputs, result)]}"
        )
        manifest_entries.append(
            {
                "file": filename,
                "sizeBytes": size,
                "sha256": sha256_file(path),
                "inputName": inputs[0].name,
                "inputShape": list(shape),
                "outputs": outputs,
            }
        )

    total_mb = total_bytes / 1e6
    print(f"Total bundled ONNX model size: {total_mb:.2f} MB")
    if total_mb >= 22.0:
        raise RuntimeError(f"Model bundle size {total_mb:.2f} MB exceeds 22 MB budget")

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"models": manifest_entries, "totalSizeBytes": total_bytes}, indent=2) + "\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="Verify existing models only")
    parser.add_argument(
        "--optimize-wasm",
        action="store_true",
        help="Optimize existing bundled ONNX models in-place for WASM XNNPACK SIMD128",
    )
    parser.add_argument("--keep-cache", action="store_true", help="Keep raw downloaded models")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.optimize_wasm:
        optimize_existing_models()
    elif not args.verify:
        prepare_nudenet(OUT_DIR / "nudenet-320n.quant.onnx")
        prepare_yunet(OUT_DIR / "yunet-2023mar.onnx")
        prepare_agr0013(OUT_DIR / "agr0013-age-gender.quant.onnx")
        prepare_marqo(OUT_DIR / "marqo-nsfw-tiny.quant.onnx")
        if not args.keep_cache and CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
            print("Cleaned .model-cache/ to conserve disk space.")

    verify_models()


if __name__ == "__main__":
    main()
