import {
  TRANSLATIONS,
  type ExtensionSettings,
  type LocaleCode,
  type ProfileId,
} from '@ghadhul-bashar/core';
import type { RuntimeRequest, UpdateSettingsResponse } from '../shared/messages.js';

const PROFILE_ORDER: ProfileId[] = ['brothers', 'sisters', 'family', 'strict', 'nsfw-only'];
let selectedProfile: ProfileId = 'brothers';
let locale: LocaleCode = 'id';

function render(): void {
  const dict = TRANSLATIONS[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = dict.isRtl ? 'rtl' : 'ltr';
  document.getElementById('tagline')!.textContent = dict.tagline;
  document.getElementById('onboardingBadge')!.textContent = dict.onboardingBadge;
  document.getElementById('onboardingHeading')!.textContent = dict.onboardingHeading;
  document.getElementById('onboardingSubheading')!.textContent = dict.onboardingSubheading;
  document.getElementById('childNote')!.textContent = dict.childExemptionNote;
  document.getElementById('continueBtn')!.textContent = dict.onboardingContinue;

  const grid = document.getElementById('cardsGrid')!;
  grid.replaceChildren();
  for (const pid of PROFILE_ORDER) {
    const card = document.createElement('button');
    card.className = `profile-card${pid === selectedProfile ? ' active' : ''}`;
    const title = document.createElement('h3');
    title.textContent = dict.profiles[pid].title;
    const desc = document.createElement('p');
    desc.textContent = dict.profiles[pid].desc;
    card.append(title, desc);
    card.addEventListener('click', () => {
      selectedProfile = pid;
      render();
    });
    grid.appendChild(card);
  }
}

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({
    type: 'GB_GET_SETTINGS',
  } satisfies RuntimeRequest)) as ExtensionSettings;
  selectedProfile = settings.profile;
  locale = settings.locale;
  (document.getElementById('localeSelect') as HTMLSelectElement).value = locale;
  render();

  document.getElementById('localeSelect')!.addEventListener('change', async (ev) => {
    locale = (ev.target as HTMLSelectElement).value as LocaleCode;
    await chrome.runtime.sendMessage({
      type: 'GB_UPDATE_SETTINGS',
      next: { ...settings, locale },
    } satisfies RuntimeRequest);
    render();
  });

  document.getElementById('continueBtn')!.addEventListener('click', async () => {
    const resp = (await chrome.runtime.sendMessage({
      type: 'GB_APPLY_PROFILE',
      profile: selectedProfile,
      completeOnboarding: true,
    } satisfies RuntimeRequest)) as UpdateSettingsResponse;
    if (resp.ok) {
      window.close();
    }
  });
}

void init();
