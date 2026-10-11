import * as THREE from 'three';
import { LAYOUT } from '../config.js';
import { paiShoBoardTexture, tileTexture } from '../world/textures.js';
import { Ease, clamp, pick, rand } from '../core/utils.js';

const TILE_R = 0.034;
const TILE_H = 0.016;
const COLORS = ['#b8392a', '#4f8a5b', '#3d6db3', '#c99a2e'];
const BEAT = 3;          // seconds per move in the "PaiSho" clip (3 moves per ~9 s loop)
const PICK_AT = 0.62;    // in a beat: hand is on the tile pile
const PLACE_AT = 1.5;    // in a beat: hand is over the target square
const IROH_TURN = 0.1;   // radians each player is turned from due east/west toward the camera
const OPP_TURN = 0.3;
const TURN_OFFSET = 1.5; // the opponent plays this many seconds behind Iroh, so they alternate
const HAND_OFFSET = new THREE.Vector3(0, 0.052, 0); // bone-local point in the middle of the hand mesh (measured)

/**
 * Iroh plays Pai Sho on a low table against an Earth Kingdom local (a random one per run). They sit
 * on the west and east sides facing each other, and play the same seated loop, the opponent half a
 * move behind. Each reaches for their own
 * pile of tiles and puts one down in a different spot, so the board really changes.
 * Purely decorative.
 */
export class PaiSho {
  constructor(game, opponents) {
    this.game = game;
    this.cfg = LAYOUT.paiSho;
    const { x, z, tableTop, size } = this.cfg;
    this.scene = game.scene;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.scene.add(this.group);
    this.half = size * 0.5 - 0.1;             // tiles stay inside the board
    this.tileMats = {};
    this.opponents = opponents;
    this.opponentIndex = -1;

    this._buildTable(size, tableTop);
    this._seatAndDress();
    this._scatterTiles();

    const c = this.cfg;
    // Iroh sits on the west side facing east, the opponent on the east side facing west. Both are
    // turned a little toward the camera so their faces show.
    const host = game.host;
    host.idleName = 'PaiSho';
    host.root.position.set(c.irohX, c.cushionTop, c.irohZ);
    host.yaw = host.targetYaw = Math.PI / 2 - IROH_TURN;
    host.root.rotation.y = host.yaw;
    host.play('PaiSho');
    this.iroh = this._seat(host);
    this.opp = this._seat(null);
    this.rollOpponent(false);
  }

  _seat(char) {
    const seat = { char: null, action: null, hand: null, pile: [], placed: [], cycle: 0, last: 0, beat: -1, state: {}, pileLocal: new THREE.Vector3() };
    if (char) { this._attach(seat, char); this._calibrate(seat); this._refill(seat, false); }
    return seat;
  }

  _attach(seat, char) {
    seat.char = char;
    seat.action = char.actions.PaiShoOpp || char.actions.PaiSho; // opponents have a face-level variant
    seat.hand = null;
    char.model.traverse((o) => { if (o.name === 'handR') seat.hand = o; });
  }

  /** Put a different Earth Kingdom local in the opponent's seat. */
  rollOpponent(animate = true) {
    let i;
    do { i = Math.floor(Math.random() * this.opponents.length); } while (i === this.opponentIndex && this.opponents.length > 1);
    this.opponentIndex = i;
    const seat = this.opp;
    if (seat.char) this.scene.remove(seat.char.root);
    for (const t of seat.pile) this.group.remove(t);
    seat.pile.length = 0;
    for (const t of seat.placed) this._retire(t);
    seat.placed.length = 0;

    const char = this.opponents[i];
    const c = this.cfg;
    char.idleName = 'PaiShoOpp';
    char.root.position.set(c.opponentX, c.cushionTop, c.opponentZ);
    const yaw = -Math.PI / 2 + OPP_TURN;
    char.yaw = char.targetYaw = yaw;
    char.root.rotation.y = yaw;
    char.play('PaiShoOpp');
    this.scene.add(char.root);
    this._attach(seat, char);
    this._calibrate(seat);
    // start half a move behind Iroh so they alternate
    const dur = seat.action.getClip().duration;
    seat.action.time = (this.iroh.action.time - TURN_OFFSET + dur) % dur;
    char.mixer.update(0);
    seat.last = seat.action.time;
    seat.beat = -1;
    this._refill(seat, animate);
    if (animate) {
      this.game.particles.emit(char.root.position.clone().setY(0.7), { kind: 'soft', count: 8, color: '#fff3d6', speed: 0.6, up: 0.6, life: 0.7, size: 0.35, gravity: 0 });
    }
  }

  _buildTable(size, tableTop) {
    const g = this.group;
    const wood = new THREE.MeshStandardMaterial({ color: '#6b3f22', roughness: 0.55 });
    const lacquer = new THREE.MeshStandardMaterial({ color: '#8e2a1e', roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a53a', roughness: 0.35, metalness: 0.6 });
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // a thin top on a central pedestal: there is nothing under the edges for knees, feet or hands to catch on
    add(new THREE.BoxGeometry(size, 0.03, size), lacquer, 0, tableTop - 0.015, 0);
    add(new THREE.BoxGeometry(size + 0.03, 0.012, size + 0.03), gold, 0, tableTop - 0.036, 0);
    add(new THREE.CylinderGeometry(0.09, 0.12, tableTop - 0.042, 20), wood, 0, (tableTop - 0.042) / 2, 0);
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 24), wood, 0, 0.015, 0);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(size - 0.12, size - 0.12),
      new THREE.MeshStandardMaterial({ map: paiShoBoardTexture(), roughness: 0.6 }),
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, tableTop + 0.002, 0);
    board.receiveShadow = true;
    g.add(board);
    this.boardY = tableTop + 0.002 + TILE_H / 2;
  }

  _seatAndDress() {
    const { x, z, irohX, irohZ, opponentX, opponentZ, tableTop, size } = this.cfg;
    const house = this.game.house;
    house.placeProp('cushion', irohX - 0.02, 0, irohZ, 1.6);
    house.placeProp('cushion', opponentX + 0.02, 0, opponentZ, 1.6);
    // tea for both players, a pot on the floor behind the table
    // (the middle of the north and south edges: the players' hands stay near the west and east rims)
    house.placeProp('cup', x, tableTop, z - size / 2 + 0.07, 1.6);
    house.placeProp('cup', x, tableTop, z + size / 2 - 0.07, 1.6);
    house.placeProp('teapot', x + 0.05, 0, z - size / 2 - 0.4, 1.5, 0.8);
    house.steamPoints.push(new THREE.Vector3(x + 0.02, 0.55, z - size / 2 - 0.42));
  }

  _tileMat(color) {
    if (!this.tileMats[color]) {
      this.tileMats[color] = [
        new THREE.MeshStandardMaterial({ color: '#efe5cb', roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ map: tileTexture(color), roughness: 0.45 }),
        new THREE.MeshStandardMaterial({ color: '#cdbf9c', roughness: 0.6 }),
      ];
    }
    return this.tileMats[color];
  }

  _makeTile() {
    const geo = this._tileGeo || (this._tileGeo = new THREE.CylinderGeometry(TILE_R, TILE_R * 0.96, TILE_H, 18));
    const t = new THREE.Mesh(geo, this._tileMat(pick(COLORS)));
    t.castShadow = true;
    t.receiveShadow = true;
    t.rotation.y = rand(0, Math.PI * 2);
    return t;
  }

  /** A mid-game position of tiles along the middle of the board, clear of both players' hands. */
  _scatterTiles() {
    const h = this.half;
    const spots = [[-0.08, -0.15], [0.0, 0.0], [0.07, 0.14], [-0.05, 0.17], [0.08, -0.08], [-0.09, 0.05], [0.0, -0.2], [0.1, 0.04]];
    for (const [px, pz] of spots) {
      const t = this._makeTile();
      t.position.set(clamp(px, -h, h), this.boardY, clamp(pz, -h, h));
      this.group.add(t);
    }
  }

  /** Where this player's hand is while reaching for the pile, so the pile sits exactly there. */
  _calibrate(seat) {
    const a = seat.action;
    const keep = a.time;
    a.time = PICK_AT;
    seat.char.mixer.update(0);
    seat.char.root.updateMatrixWorld(true);
    const p = this.handPoint(seat);
    a.time = keep;
    seat.char.mixer.update(0);
    // keep the pile on the board, in front of the player
    const local = this.group.worldToLocal(p.clone());
    seat.pileLocal.set(
      clamp(local.x, -this.half - 0.04, this.half + 0.04),
      this.boardY,
      clamp(local.z, -this.half - 0.04, this.half + 0.04),
    );
  }

  handPoint(seat, out = new THREE.Vector3()) {
    if (!seat.hand) return out.copy(seat.char.root.position);
    seat.hand.updateWorldMatrix(true, false);
    return seat.hand.localToWorld(out.copy(HAND_OFFSET));
  }

  _refill(seat, animate = true) {
    for (let i = 0; i < 3; i++) {
      const t = this._makeTile();
      t.position.copy(seat.pileLocal).add(new THREE.Vector3(rand(-0.008, 0.008), i * TILE_H, rand(-0.008, 0.008)));
      this.group.add(t);
      seat.pile.push(t);
      if (animate) {
        t.scale.setScalar(0.01);
        this.game.tweens.add({ duration: 0.3, delay: i * 0.12, ease: Ease.outBack, update: (k) => t.scale.setScalar(Math.max(0.01, k)) });
      }
    }
  }

  _retire(t) {
    this.game.tweens.add({
      duration: 0.35, ease: Ease.linear,
      update: (k) => t.scale.setScalar(Math.max(0.01, 1 - k)),
      onComplete: () => this.group.remove(t),
    });
  }

  _newCycle(seat) {
    seat.cycle++;
    // tiles from two moves ago are taken off the board; a fresh pile is drawn
    seat.placed = seat.placed.filter((t) => {
      if (t.userData.cycle <= seat.cycle - 2) { this._retire(t); return false; }
      return true;
    });
    for (const t of seat.pile) this.group.remove(t);
    seat.pile.length = 0;
    this._refill(seat, true);
    if (this.game.state === 'playing' && Math.random() < (seat === this.iroh ? 0.6 : 0.35)) {
      this.game.hud.emote(seat.char.root, '🤔', 1.2);
    }
  }

  update(dt) {
    this.opp.char.update(dt); // Iroh is updated by the game
    this._updateSeat(this.iroh, dt);
    this._updateSeat(this.opp, dt);
  }

  _updateSeat(seat, dt) {
    const time = seat.action.time;
    const beat = Math.min(2, Math.floor(time / BEAT));
    const u = time - beat * BEAT;
    if (time < seat.last - 1) this._newCycle(seat);   // looped
    seat.last = time;
    if (beat !== seat.beat) {
      seat.beat = beat;
      seat.state = { tile: null, carried: false, placed: false };
    }
    const s = seat.state;

    if (!s.carried && !s.placed && u >= PICK_AT && seat.pile.length) {
      s.tile = seat.pile.pop();
      s.carried = true;
      s.from = s.tile.position.clone().applyMatrix4(this.group.matrixWorld);
      this.game.sfx.play('tile');
    }
    if (s.carried && !s.placed) {
      // follow the hand: ease from the pile onto the hand, then ride it to the target
      const hand = this.handPoint(seat, seat._hand || (seat._hand = new THREE.Vector3()));
      const k = Ease.outQuad(clamp((u - PICK_AT) / 0.18, 0, 1));
      const lift = 0.025 * Math.sin(Math.PI * clamp((u - PICK_AT) / (PLACE_AT - PICK_AT), 0, 1));
      const w = s.from.clone().lerp(hand, k);
      w.y += lift;
      s.tile.position.copy(this.group.worldToLocal(w));
      s.tile.rotation.y += dt * 3;
      if (u >= PLACE_AT) {
        // set it down, then push it a little further onto the board (away from the player)
        const target = this.group.worldToLocal(hand.clone());
        const toCentre = new THREE.Vector3(-target.x, 0, -target.z).normalize();
        const push = rand(0.03, 0.22);
        const fx = clamp(Math.round((target.x + toCentre.x * push + rand(-0.06, 0.06)) / 0.045) * 0.045, -this.half, this.half);
        const fz = clamp(Math.round((target.z + toCentre.z * push + rand(-0.06, 0.06)) / 0.045) * 0.045, -this.half, this.half);
        const from = s.tile.position.clone();
        const tile = s.tile;
        tile.userData.cycle = seat.cycle;
        seat.placed.push(tile);
        s.placed = true;
        s.carried = false;
        this.game.tweens.add({
          duration: 0.3, ease: Ease.outQuad,
          update: (kk) => { tile.position.set(from.x + (fx - from.x) * kk, from.y + (this.boardY - from.y) * kk, from.z + (fz - from.z) * kk); },
          onComplete: () => this.game.sfx.play('tile'),
        });
      }
    }
  }
}
