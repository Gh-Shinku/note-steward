import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from 'obsidian';
import { translations } from './i18n';
import { StewardService } from './services/steward-service';
import { LocaleSetting } from './types';

export class NoteStewardSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly service: StewardService,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = translations(this.service.persistedData.settings.locale);
		return [
			{
				name: t.language,
				desc: t.languageDesc,
				control: {
					type: 'dropdown',
					key: 'locale',
					defaultValue: 'auto',
					options: {
						auto: t.auto,
						en: t.english,
						'zh-CN': t.chinese,
					},
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return key === 'locale'
			? this.service.persistedData.settings.locale
			: undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key !== 'locale' || !isLocale(value)) return;
		await this.service.setLocale(value);
	}

	display(): void {
		const { containerEl } = this;
		const t = translations(this.service.persistedData.settings.locale);
		containerEl.empty();
		new Setting(containerEl).setName('').setHeading();
		new Setting(containerEl)
			.setName(t.language)
			.setDesc(t.languageDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('auto', t.auto)
					.addOption('en', t.english)
					.addOption('zh-CN', t.chinese)
					.setValue(this.service.persistedData.settings.locale)
					.onChange(async (value) => {
						await this.service.setLocale(value as LocaleSetting);
					}),
			);
	}
}

function isLocale(value: unknown): value is LocaleSetting {
	return value === 'auto' || value === 'en' || value === 'zh-CN';
}
