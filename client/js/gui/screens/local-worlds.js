import { onOff, tr } from '../i18n.js';
import { ListOf } from '../slot-list.js';
import { Button, Slider, TextField } from '../widgets.js';
import { Screen } from './manager.js';
import { WORLD_DATABASE, openCheckpointStore } from '../../local-world/checkpoints.js';
import { TERRAIN_PARAMETERS, WORLD_FEATURES, WORLD_TYPES, describeWorld, featureAvailable, randomSeed, worldSettings } from '../../local-world/world-settings.js';
import { platform } from '../../platform/platform.js';

const terrainLabel = type => tr('minecraftjs.local.terrain.' + type);

export class LocalWorldsScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
    this.worlds = [];
  }

  init() {
    const x = this.width / 2 - 100;
    const y = this.height - 51;
    const scroll = this.list?.amountScrolled || 0;
    this.list = new ListOf(this, 36, y - 46, 22, {
      size: () => this.worlds.length,
      selected: i => this.selected === this.worlds[i],
      draw: (gui, i, left, top) => gui.text(gui.font.trimToWidth(this.worlds[i], 216), left, top + 6, 0xffffff),
      click: (i, double) => {
        this.selectWorld(this.worlds[i]);
        if (double) this.openSelected();
      },
    });
    this.list.amountScrolled = scroll;
    this.openButton = new Button(0, x, y, 98, 20, tr('minecraftjs.local.open'), () => this.openSelected());
    this.createButton = new Button(1, x + 102, y, 98, 20, tr('minecraftjs.local.create'), () => {
      this.game.screens.open(new CreateLocalWorldScreen(this.game, this));
    });
    this.buttons.push(this.openButton, this.createButton);
    this.buttons.push(new Button(2, x, y + 24, 200, 20, tr('gui.cancel'), () => this.close()));
    this.copySeedButton = new Button(3, x + 140, y - 28, 60, 20, tr('minecraftjs.local.copySeed'), () => {
      if (this.info && !this.info.legacySeed) platform().setClipboard(this.info.seed);
    });
    this.copySeedButton.visible = false;
    this.buttons.push(this.copySeedButton);
    this.loading ??= this.load();
  }

  async selectWorld(name) {
    if (this.selected === name) return;
    this.selected = name;
    this.info = null;
    let store;
    try {
      store = await openCheckpointStore(WORLD_DATABASE);
      const record = await store.load(name);
      if (this.selected === name && record) this.info = describeWorld(record.state);
    } catch (error) {
      if (this.selected === name) this.error = error.message;
    } finally {
      store?.close();
    }
  }

  async load() {
    let store;
    try {
      this.error = await this.game.localWorldClose;
      store = await openCheckpointStore(WORLD_DATABASE);
      this.worlds = await store.list();
      this.ready = true;
    } catch (error) {
      this.error = error.message;
    } finally {
      store?.close();
    }
  }

  openSelected() {
    if (this.ready && this.selected) this.game.connectLocalWorld({ name: this.selected });
  }

  renderContent(gui, mx, my) {
    this.list.render(gui, mx, my);
    this.openButton.enabled = !!(this.ready && this.selected);
    this.createButton.enabled = !!this.ready;
    this.copySeedButton.visible = !!this.info && !this.info.legacySeed;
    gui.textCentered(tr('minecraftjs.local.worlds'), this.width / 2, 15, 0xffffff);
    if (this.info) {
      const y = this.height - 51;
      gui.textCentered(terrainLabel(this.info.worldType), this.width / 2, y - 40, 0xffffff);
      const label = tr(this.info.legacySeed ? 'minecraftjs.local.legacySeed' : 'minecraftjs.local.seedLabel');
      const text = label + ': ' + this.info.seed;
      gui.text(gui.font.trimToWidth(text, this.info.legacySeed ? 200 : 134), this.width / 2 - 100, y - 21, 0xb0b0b0);
    }
    const status = this.error || (!this.ready ? tr('minecraftjs.loading') :
      !this.worlds.length ? tr('minecraftjs.local.empty') : '');
    if (status) gui.textCentered(gui.font.trimToWidth(status, this.width - 16), this.width / 2, 45, 0xffffff);
  }

  mouseDown(x, y, button) {
    return super.mouseDown(x, y, button) || this.list.mouseDown(x, y, button);
  }

  mouseUp(x, y, button) {
    super.mouseUp(x, y, button);
    this.list.mouseUp();
  }

  mouseMove(x, y) { this.list.mouseMove(x, y); }
  wheel(delta) { this.list.wheel(delta); }
  close() { this.game.screens.open(this.parent); }
}

export class CreateLocalWorldScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
    this.settings = worldSettings();
  }

  init() {
    const x = this.width / 2 - 100;
    this.nameField = new TextField(x, 50, 200, 20, {
      text: this.nameField?.text ?? tr('minecraftjs.local.newWorld'),
      focused: true,
      onEnter: () => this.create(),
    });
    this.seedField = new TextField(x, 87, 142, 20, {
      text: this.seedField?.text ?? '',
      maxLength: 80,
      onEnter: () => this.create(),
    });
    this.fields.push(this.nameField, this.seedField);
    this.buttons.push(new Button(2, x + 146, 87, 54, 20, tr('minecraftjs.local.randomSeed'), () => {
      this.seedField.setText(randomSeed());
    }));
    this.buttons.push(new Button(3, x, 114, 200, 20,
      () => tr('minecraftjs.local.terrain') + ': ' + terrainLabel(this.settings.worldType), () => {
        const next = WORLD_TYPES[(WORLD_TYPES.indexOf(this.settings.worldType) + 1) % WORLD_TYPES.length];
        this.settings = worldSettings({ worldType: next, starterMaterials: this.settings.starterMaterials });
      }));
    this.buttons.push(new Button(4, x, 138, 200, 20, tr('minecraftjs.local.options'), () => {
      this.game.screens.open(new LocalWorldOptionsScreen(this.game, this));
    }));
    this.createButton = new Button(0, x, this.height - 29, 98, 20, tr('minecraftjs.local.create'), () => this.create());
    this.buttons.push(this.createButton);
    this.buttons.push(new Button(1, x + 102, this.height - 29, 98, 20, tr('gui.cancel'), () => this.close()));
  }

  create() {
    const name = this.nameField.text.trim();
    if (name) this.game.connectLocalWorld({ name, seed: this.seedField.text, settings: { ...this.settings }, create: true });
  }

  renderContent(gui) {
    const x = this.width / 2 - 100;
    this.createButton.enabled = !!this.nameField.text.trim();
    gui.textCentered(tr('minecraftjs.local.create'), this.width / 2, 15, 0xffffff);
    gui.text(tr('minecraftjs.local.name'), x, 39, 0xa0a0a0);
    gui.text(tr('minecraftjs.local.seed'), x, 76, 0xa0a0a0);
    if (this.height >= 205) gui.textCentered(tr('minecraftjs.local.buildMode'), this.width / 2, 164, 0xa0a0a0);
  }

  close() { this.game.screens.open(this.parent); }
}

class LocalWorldOptionsScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
  }

  init() {
    const x = this.width / 2 - 100;
    for (const [i, feature] of WORLD_FEATURES.entries()) {
      const button = new Button(i, x, 36 + i * 24, 200, 20,
        () => tr('minecraftjs.local.feature.' + feature) + ': ' + onOff(this.parent.settings[feature]), () => {
          this.parent.settings[feature] = !this.parent.settings[feature];
        });
      button.enabled = featureAvailable(this.parent.settings.worldType, feature);
      this.buttons.push(button);
    }
    if (this.parent.settings.worldType === 'custom') {
      this.buttons.push(new Button(6, x, 156, 200, 20, tr('minecraftjs.local.customize'), () => {
        this.game.screens.open(new CustomTerrainScreen(this.game, this));
      }));
    }
    this.buttons.push(new Button(5, x, this.height - 29, 200, 20, tr('gui.done'), () => this.close()));
  }

  renderContent(gui) {
    gui.textCentered(tr('minecraftjs.local.options'), this.width / 2, 15, 0xffffff);
  }

  close() { this.game.screens.open(this.parent); }
}

class CustomTerrainScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
  }

  init() {
    const x = this.width / 2 - 100;
    const settings = this.parent.parent.settings;
    for (const [i, { key, min, max }] of TERRAIN_PARAMETERS.entries()) {
      this.buttons.push(new Slider(i, x, 36 + i * 24, 200, 20,
        () => tr('minecraftjs.local.parameter.' + key) + ': ' + settings[key],
        (settings[key] - min) / (max - min), value => {
          settings[key] = Math.round(min + value * (max - min));
        }));
    }
    this.buttons.push(new Button(4, x, this.height - 29, 200, 20, tr('gui.done'), () => this.close()));
  }

  renderContent(gui) {
    gui.textCentered(tr('minecraftjs.local.customize'), this.width / 2, 15, 0xffffff);
  }

  close() { this.game.screens.open(this.parent); }
}
