"""Convert Intel OpenVINO IR (v10/v11) CNN to ONNX without retraining.

Supports Parameter, Const, Convolution (with Add bias folding), Add, ReLU,
MaxPool, AvgPool, SoftMax, Reshape, Squeeze, and Result nodes used by
Intel Open Model Zoo `age-gender-recognition-retail-0013`.
"""

import argparse
import xml.etree.ElementTree as ET
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

DTYPES = {
    "f32": np.float32,
    "f16": np.float16,
    "i64": np.int64,
    "i32": np.int32,
    "u8": np.uint8,
}


def parse_ints(raw: str) -> list[int]:
    return [int(val) for val in raw.replace(" ", "").split(",") if val != ""]


def convert_openvino_ir(
    xml_path: str,
    bin_path: str,
    out_path: str,
    keep_outputs: set[str],
    renames: dict[str, str],
) -> list[str]:
    root = ET.parse(xml_path).getroot()
    with open(bin_path, "rb") as f:
        blob = f.read()

    layers = {layer.get("id"): layer for layer in root.find("layers")}
    edges = {
        (edge.get("to-layer"), edge.get("to-port")): (
            edge.get("from-layer"),
            edge.get("from-port"),
        )
        for edge in root.find("edges")
    }

    def inputs_of(lid: str) -> list[str]:
        ports = sorted(
            (int(tp), fl)
            for (tl, tp), (fl, _fp) in edges.items()
            if tl == lid
        )
        return [fl for _, fl in ports]

    def const_array(lid: str) -> np.ndarray:
        attrs = layers[lid].find("data").attrib
        dtype = DTYPES[attrs["element_type"]]
        count = int(attrs["size"]) // np.dtype(dtype).itemsize
        arr = np.frombuffer(
            blob, dtype=dtype, count=count, offset=int(attrs["offset"])
        )
        shape = parse_ints(attrs["shape"])
        return arr.reshape(shape).astype(
            np.int64 if dtype in (np.int64, np.int32) else np.float32
        )

    order: list[str] = []
    seen: set[str] = set()

    def visit(lid: str) -> None:
        if lid in seen:
            return
        seen.add(lid)
        for src in inputs_of(lid):
            visit(src)
        order.append(lid)

    for lid in layers:
        visit(lid)

    consts: dict[str, np.ndarray] = {}
    names: dict[str, str] = {}
    nodes: list[onnx.NodeProto] = []
    inits: list[onnx.TensorProto] = []
    graph_inputs: list[onnx.ValueInfoProto] = []
    graph_outputs: list[onnx.ValueInfoProto] = []
    folded_bias: set[str] = set()
    available_results: list[str] = []

    def ensure_const(lid: str) -> str:
        if lid not in names:
            cname = f"c_{lid}"
            inits.append(numpy_helper.from_array(consts[lid], cname))
            names[lid] = cname
        return names[lid]

    for lid in order:
        layer = layers[lid]
        typ = layer.get("type")
        name = layer.get("name") or f"layer_{lid}"
        data = layer.find("data")
        attrs = data.attrib if data is not None else {}
        ins = inputs_of(lid)
        out_name = f"t_{lid}"

        if typ == "Const":
            consts[lid] = const_array(lid)
            continue

        if typ == "Parameter":
            shape = parse_ints(attrs["shape"])
            graph_inputs.append(
                helper.make_tensor_value_info("input", TensorProto.FLOAT, shape)
            )
            names[lid] = "input"
            continue

        if typ == "Convolution":
            x_id, w_id = ins
            wname = f"w_{lid}"
            inits.append(numpy_helper.from_array(consts[w_id], wname))
            conv_inputs = [names[x_id], wname]

            consumers = [tl for (tl, _tp), (fl, _fp) in edges.items() if fl == lid]
            if len(consumers) == 1 and layers[consumers[0]].get("type") == "Add":
                add_id = consumers[0]
                others = [s for s in inputs_of(add_id) if s != lid]
                if others and others[0] in consts:
                    bname = f"b_{lid}"
                    inits.append(
                        numpy_helper.from_array(
                            consts[others[0]].astype(np.float32).reshape(-1), bname
                        )
                    )
                    conv_inputs.append(bname)
                    folded_bias.add(add_id)
                    out_name = f"t_{add_id}"
                    names[add_id] = out_name

            pb = parse_ints(attrs.get("pads_begin", "0,0"))
            pe = parse_ints(attrs.get("pads_end", "0,0"))
            nodes.append(
                helper.make_node(
                    "Conv",
                    conv_inputs,
                    [out_name],
                    name=name,
                    strides=parse_ints(attrs.get("strides", "1,1")),
                    dilations=parse_ints(attrs.get("dilations", "1,1")),
                    pads=pb + pe,
                    kernel_shape=list(consts[w_id].shape[2:]),
                )
            )
            names[lid] = out_name
            continue

        if typ == "Add":
            if lid in folded_bias:
                continue
            a, b = ins
            in_a = ensure_const(a) if a in consts else names[a]
            in_b = ensure_const(b) if b in consts else names[b]
            nodes.append(helper.make_node("Add", [in_a, in_b], [out_name], name=name))
        elif typ == "ReLU":
            nodes.append(helper.make_node("Relu", [names[ins[0]]], [out_name], name=name))
        elif typ == "MaxPool":
            pb = parse_ints(attrs.get("pads_begin", "0,0"))
            pe = parse_ints(attrs.get("pads_end", "0,0"))
            nodes.append(
                helper.make_node(
                    "MaxPool",
                    [names[ins[0]]],
                    [out_name],
                    name=name,
                    kernel_shape=parse_ints(attrs["kernel"]),
                    strides=parse_ints(attrs["strides"]),
                    pads=pb + pe,
                    ceil_mode=1 if attrs.get("rounding_type") == "ceil" else 0,
                )
            )
        elif typ == "AvgPool":
            pb = parse_ints(attrs.get("pads_begin", "0,0"))
            pe = parse_ints(attrs.get("pads_end", "0,0"))
            nodes.append(
                helper.make_node(
                    "AveragePool",
                    [names[ins[0]]],
                    [out_name],
                    name=name,
                    kernel_shape=parse_ints(attrs["kernel"]),
                    strides=parse_ints(attrs["strides"]),
                    pads=pb + pe,
                    count_include_pad=0
                    if attrs.get("exclude-pad", "true") == "true"
                    else 1,
                )
            )
        elif typ == "SoftMax":
            nodes.append(
                helper.make_node(
                    "Softmax",
                    [names[ins[0]]],
                    [out_name],
                    name=name,
                    axis=int(attrs.get("axis", 1)),
                )
            )
        elif typ == "Reshape":
            shape_in = ensure_const(ins[1]) if ins[1] in consts else names[ins[1]]
            nodes.append(
                helper.make_node("Reshape", [names[ins[0]], shape_in], [out_name], name=name)
            )
        elif typ == "Result":
            src = ins[0]
            src_name = layers[src].get("name") or ""
            # Also match original Convolution name if its bias Add was folded.
            candidate_names = [src_name]
            if src in folded_bias:
                for prev_id in inputs_of(src):
                    if prev_id not in consts:
                        candidate_names.append(layers[prev_id].get("name") or "")
            available_results.extend(candidate_names)

            matched_name = next((c for c in candidate_names if not keep_outputs or c in keep_outputs), None)
            if matched_name is None:
                continue

            final_name = renames.get(matched_name, matched_name)
            nodes.append(
                helper.make_node("Identity", [names[src]], [final_name], name=f"out_{final_name}")
            )
            dims = [int(d.text) for d in layers[src].find("output/port").findall("dim")]
            graph_outputs.append(
                helper.make_tensor_value_info(final_name, TensorProto.FLOAT, dims)
            )
            continue
        else:
            raise NotImplementedError(f"Unsupported OpenVINO layer type {typ!r} ({name})")

        names[lid] = out_name

    if not graph_outputs:
        raise RuntimeError(f"No outputs matched {keep_outputs}. Found Result sources: {available_results}")

    needed = {o.name for o in graph_outputs}
    kept: list[onnx.NodeProto] = []
    for node in reversed(nodes):
        if any(o in needed for o in node.output):
            kept.append(node)
            needed.update(node.input)
    kept.reverse()
    inits = [init for init in inits if init.name in needed]

    graph = helper.make_graph(kept, "agr0013_converted", graph_inputs, graph_outputs, inits)
    model = helper.make_model(
        graph,
        opset_imports=[helper.make_opsetid("", 13)],
        producer_name="ghadhul-bashar-openvino2onnx",
    )
    model.ir_version = 8
    onnx.checker.check_model(model)
    model = onnx.shape_inference.infer_shapes(model)
    onnx.save(model, out_path)
    return [o.name for o in graph_outputs]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xml")
    parser.add_argument("bin")
    parser.add_argument("out")
    parser.add_argument("--outputs", nargs="*", default=[])
    parser.add_argument("--rename", nargs="*", default=[])
    args = parser.parse_args()
    renames = dict(item.split("=", 1) for item in args.rename)
    written = convert_openvino_ir(args.xml, args.bin, args.out, set(args.outputs), renames)
    print(f"Converted OpenVINO IR -> {args.out} outputs={written}")


if __name__ == "__main__":
    main()
