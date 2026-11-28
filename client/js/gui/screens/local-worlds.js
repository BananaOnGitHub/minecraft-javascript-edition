import { onOff, tr } from '../i18n.js';
import { ListOf } from '../slot-list.js';
import { Button, Slider, TextField } from '../widgets.js';
import { Screen } from './manager.js';
import { WORLD_DATABASE, openCheckpointStore } from '../../local-world/checkpoints.js';
import { TERRAIN_PARAMETERS, WORLD_FEATURES, WORLD_TYPES, describeWorld, featureAvailable, worldSettings } from '../../local-world/world-settings.js';
import { platform } from '../../platform/platform.js';
import { creationStatus, newCreationOptions, saveDirectory, selectGameMode, uniqueDirectory } from '../../local-world/world-metadata.js';
import { FLAT_PRESETS, flatSettings } from '../../local-world/flat-world.js';

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
      selected: i => this.selected === this.worlds[i].id,
      draw: (gui, i, left, top) => gui.text(gui.font.trimToWidth(this.worlds[i].displayName, 216), left, top + 6, 0xffffff),
      click: (i, double) => {
        this.selectWorld(this.worlds[i].id);
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
      this.worlds = await store.summaries();
      this.ready = true;
    } catch (error) {
      this.error = error.message;
    } finally {
      store?.close();
    }
  }

  openSelected() {
    if (this.ready && this.selected) this.game.connectLocalWorld({ id: this.selected, name: this.info?.displayName ?? this.selected });
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
    this.settings = worldSettings({ worldType: 'defaultExperimental', starterMaterials: false });
    this.creation = newCreationOptions();
    this.flat = flatSettings();
    this.more = false;
  }

  init() {
    const width = Math.min(280, this.width - 32);
    const x = Math.floor((this.width - width) / 2);
    const half = Math.floor((width - 8) / 2);
    const name = this.nameField?.text ?? tr('minecraftjs.local.newWorld');
    const seed = this.seedField?.text ?? '';
    this.nameField = new TextField(x, 49, width, 20, {
      text: name, focused: !this.more, maxLength: 32,
      onEnter: () => this.create(),
    });
    this.seedField = new TextField(x, 49, width, 20, {
      text: seed, focused: this.more, maxLength: 80,
      onEnter: () => this.create(),
    });
    this.fields.push(this.more ? this.seedField : this.nameField);
    const bottom = this.height - 29;
    this.createButton = new Button(0, x, bottom, half, 20, tr('minecraftjs.local.create'), () => this.create());
    this.buttons.push(this.createButton, new Button(1, x + half + 8, bottom, half, 20, tr('gui.cancel'), () => this.close()));
    if (!this.more) {
      this.buttons.push(new Button(2, x, 101, width, 20,
        () => tr('minecraftjs.local.mode') + ': ' + tr('minecraftjs.local.mode.' + this.creation.gameMode), () => {
          const modes = ['survival', 'hardcore', 'creative'];
          selectGameMode(this.creation, modes[(modes.indexOf(this.creation.gameMode) + 1) % modes.length]);
        }));
      this.buttons.push(new Button(3, x, 157, width, 20, tr('minecraftjs.local.options'), () => this.setPage(true)));
      return;
    }

    this.buttons.push(new Button(4, x, 91, half, 20,
      () => tr('minecraftjs.local.structures') + ' ' + onOff(this.creation.structures), () => {
        this.creation.structures = !this.creation.structures;
      }));
    this.buttons.push(new Button(5, x + half + 8, 91, half, 20,
      () => terrainLabel(this.settings.worldType), () => {
        const next = WORLD_TYPES[(WORLD_TYPES.indexOf(this.settings.worldType) + 1) % WORLD_TYPES.length];
        this.settings = worldSettings({ worldType: next, starterMaterials: false });
        this.onResize();
      }));
    const cheats = new Button(6, x, 123, half, 20,
      () => tr('minecraftjs.local.cheats') + ' ' + onOff(!this.creation.hardcore && this.creation.cheats), () => {
        this.creation.cheats = !this.creation.cheats;
        this.creation.cheatsTouched = true;
      });
    const bonus = new Button(7, x + half + 8, 123, half, 20,
      () => tr('minecraftjs.local.bonus') + ' ' + onOff(!this.creation.hardcore && this.creation.bonusChest), () => {
        this.creation.bonusChest = !this.creation.bonusChest;
      });
    cheats.enabled = bonus.enabled = !this.creation.hardcore;
    this.buttons.push(cheats, bonus);
    if (this.settings.worldType === 'flat') {
      this.buttons.push(new Button(9, x, 155, half, 20, tr('minecraftjs.local.layers'), () => {
        this.game.screens.open(new FlatLayersScreen(this.game, this));
      }));
    } else {
      this.buttons.push(new Button(9, x, 155, half, 20, tr('minecraftjs.local.features'), () => {
        this.game.screens.open(new LocalWorldOptionsScreen(this.game, this));
      }));
    }
    this.buttons.push(new Button(8, x + half + 8, 155, half, 20, tr('gui.done'), () => this.setPage(false)));
  }

  setPage(more) {
    this.more = more;
    this.onResize();
  }

  create() {
    const name = this.nameField.text.trim();
    if (!name || this.creating) return;
    this.creating = true;
    this.game.connectLocalWorld({
      name, seed: this.seedField.text, settings: { ...this.settings },
      flat: structuredClone(this.flat), creation: { ...this.creation }, create: true,
    });
  }

  renderContent(gui) {
    const width = Math.min(280, this.width - 32);
    const x = Math.floor((this.width - width) / 2);
    this.createButton.enabled = !!this.nameField.text.trim() && !this.creating;
    gui.textCentered(tr('minecraftjs.local.setup'), this.width / 2, 14, 0xffffff);
    gui.text(tr(this.more ? 'minecraftjs.local.seed' : 'minecraftjs.local.name'), x, 36, 0xa0a0a0);
    if (!this.more) {
      const directory = uniqueDirectory(saveDirectory(this.nameField.text), (this.parent?.worlds ?? []).map(world => world.directory));
      gui.text(gui.font.trimToWidth(tr('minecraftjs.local.saveFolder') + ' ' + directory, width), x, 76, 0xa0a0a0);
      gui.text(gui.font.trimToWidth(tr('minecraftjs.local.description.' + this.creation.gameMode), width), x, 129, 0xc0c0c0);
    } else {
      gui.text(tr('minecraftjs.local.blankSeed'), x, 76, 0xa0a0a0);
      gui.text(tr('minecraftjs.local.pendingStructures'), x, 113, 0xb0a080);
      gui.text(tr('minecraftjs.local.pendingChest'), x + Math.floor((width + 8) / 2), 145, 0xb0a080);
    }
    const statuses = creationStatus(this.settings, this.creation);
    if (statuses.length) {
      const message = statuses.find(message => message.startsWith('Legacy') || message.startsWith('Experimental')) ?? statuses[0];
      const lines = gui.font.wrap(message, width);
      for (const [i, line] of lines.slice(0, 2).entries()) gui.text(line, x, 184 + i * 10, 0xc0a080);
    }
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
    gui.textCentered(tr('minecraftjs.local.features'), this.width / 2, 15, 0xffffff);
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

export class FlatLayersScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
    this.config = structuredClone(parent.flat);
    this.selected = this.config.layers.length - 1;
    this.preset = 0;
  }

  init() {
    const x = this.width / 2 - 140;
    this.list = new ListOf(this, 32, this.height - 108, 20, {
      size: () => this.config.layers.length,
      selected: i => this.selected === this.config.layers.length - i - 1,
      click: i => {
        if (!this.apply()) return;
        this.selected = this.config.layers.length - i - 1;
        this.readLayer();
      },
      draw: (gui, i, left, top) => {
        const layer = this.config.layers[this.config.layers.length - i - 1];
        const block = this.game.assets?.data?.blocks?.find(block => block.id === layer.id);
        const text = layer.count + ' × ' + (block?.displayName ?? 'Block ' + layer.id) + ' [' + layer.id + ':' + layer.metadata + ']';
        gui.text(gui.font.trimToWidth(text, 216), left, top + 5, 0xffffff);
      },
    });
    this.count = new TextField(x + 36, this.height - 99, 40, 20, { maxLength: 3 });
    this.block = new TextField(x + 108, this.height - 99, 40, 20, { maxLength: 3 });
    this.metadata = new TextField(x + 185, this.height - 99, 30, 20, { maxLength: 2 });
    this.biome = new TextField(x + 250, this.height - 99, 30, 20, { text: String(this.config.biome), maxLength: 3 });
    this.fields.push(this.count, this.block, this.metadata, this.biome);
    this.readLayer();
    this.buttons.push(new Button(1, x, this.height - 72, 88, 20, tr('minecraftjs.local.addLayer'), () => {
      if (!this.apply() || this.config.layers.length >= 32) return;
      this.config.layers.splice(this.selected + 1, 0, { id: 1, metadata: 0, count: 1 });
      this.selected++;
      this.readLayer();
    }));
    this.buttons.push(new Button(2, x + 96, this.height - 72, 88, 20, tr('minecraftjs.local.removeLayer'), () => {
      if (this.config.layers.length <= 1) return;
      this.config.layers.splice(this.selected, 1);
      this.selected = Math.max(0, this.selected - 1);
      this.readLayer();
    }));
    this.buttons.push(new Button(3, x + 192, this.height - 72, 88, 20, tr('minecraftjs.local.preset'), () => {
      this.preset = (this.preset + 1) % FLAT_PRESETS.length;
      this.config = flatSettings(FLAT_PRESETS[this.preset]);
      this.selected = this.config.layers.length - 1;
      this.biome.setText(String(this.config.biome));
      this.readLayer();
    }));
    this.buttons.push(new Button(0, x, this.height - 29, 136, 20, tr('gui.done'), () => {
      if (!this.apply()) return;
      this.parent.flat = structuredClone(this.config);
      this.close();
    }));
    this.buttons.push(new Button(4, x + 144, this.height - 29, 136, 20, tr('gui.cancel'), () => this.close()));
  }

  readLayer() {
    const layer = this.config.layers[this.selected];
    this.count.setText(String(layer.count));
    this.block.setText(String(layer.id));
    this.metadata.setText(String(layer.metadata));
    this.error = null;
  }

  apply() {
    try {
      const config = structuredClone(this.config);
      config.layers[this.selected] = { id: Number(this.block.text), metadata: Number(this.metadata.text), count: Number(this.count.text) };
      config.biome = Number(this.biome.text);
      this.config = flatSettings(config);
      this.error = null;
      return true;
    } catch (error) {
      this.error = error.message;
      return false;
    }
  }

  renderContent(gui, mx, my) {
    this.list.render(gui, mx, my);
    gui.textCentered(tr('minecraftjs.local.layers'), this.width / 2, 14, 0xffffff);
    const x = this.width / 2 - 140;
    for (const [label, offset] of [['N', 0], ['ID', 82], ['Meta', 153], ['Biome', 219]]) {
      gui.text(label, x + offset, this.height - 93, 0xa0a0a0);
    }
    if (this.error) gui.textCentered(gui.font.trimToWidth(this.error, 280), this.width / 2, this.height - 44, 0xff8888);
  }

  mouseDown(x, y, button) { return super.mouseDown(x, y, button) || this.list.mouseDown(x, y, button); }
  mouseMove(x, y) { this.list.mouseMove(x, y); }
  mouseUp(x, y, button) { super.mouseUp(x, y, button); this.list.mouseUp(); }
  wheel(delta) { this.list.wheel(delta); }
  key(e) { if (e.code === 'Escape') { this.close(); return true; } return super.key(e); }
  close() { this.game.screens.open(this.parent); }
}
