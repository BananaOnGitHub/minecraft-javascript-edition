import { tr } from '../i18n.js';
import { ListOf } from '../slot-list.js';
import { Button, TextField } from '../widgets.js';
import { Screen } from './manager.js';
import { WORLD_DATABASE, openCheckpointStore } from '../../local-world/checkpoints.js';

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
    this.list = new ListOf(this, 36, y - 8, 22, {
      size: () => this.worlds.length,
      selected: i => this.selected === this.worlds[i],
      draw: (gui, i, left, top) => gui.text(gui.font.trimToWidth(this.worlds[i], 216), left, top + 6, 0xffffff),
      click: (i, double) => {
        this.selected = this.worlds[i];
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
    this.loading ??= this.load();
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
    gui.textCentered(tr('minecraftjs.local.worlds'), this.width / 2, 15, 0xffffff);
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

class CreateLocalWorldScreen extends Screen {
  constructor(game, parent) {
    super(game);
    this.parent = parent;
    this.background = 'dirt';
  }

  init() {
    const x = this.width / 2 - 100;
    this.nameField = new TextField(x, 50, 200, 20, {
      text: this.nameField?.text ?? 'Terrace Yard',
      focused: true,
      onEnter: () => this.create(),
    });
    this.seedField = new TextField(x, 87, 200, 20, {
      text: this.seedField?.text ?? '',
      maxLength: 64,
      onEnter: () => this.create(),
    });
    this.fields.push(this.nameField, this.seedField);
    this.createButton = new Button(0, x, this.height - 29, 98, 20, tr('minecraftjs.local.create'), () => this.create());
    this.buttons.push(this.createButton);
    this.buttons.push(new Button(1, x + 102, this.height - 29, 98, 20, tr('gui.cancel'), () => this.close()));
  }

  create() {
    const name = this.nameField.text.trim();
    if (name) this.game.connectLocalWorld({ name, seed: this.seedField.text, create: true });
  }

  renderContent(gui) {
    const x = this.width / 2 - 100;
    this.createButton.enabled = !!this.nameField.text.trim();
    gui.textCentered(tr('minecraftjs.local.create'), this.width / 2, 15, 0xffffff);
    gui.text(tr('minecraftjs.local.name'), x, 39, 0xa0a0a0);
    gui.text(tr('minecraftjs.local.seed'), x, 76, 0xa0a0a0);
  }

  close() { this.game.screens.open(this.parent); }
}
