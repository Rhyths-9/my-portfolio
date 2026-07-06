// Phaser 3 scene — interior of the house.
// Loaded when the player walks through the front door from ExteriorScene.
//
// Map:  assets/Interior1_fixed.tmj  (39×33 tiles, 16 px/tile = 624×528 px)
// Tilesets (CraftPix "Main Character's Home" pack):
//   walls_floor.png  firstgid 1    (11 cols × 16 rows)
//   Interior.png     firstgid 177  (14 cols × 27 rows)
//   Doors_windows_animation.png  firstgid 555  (17 cols × 12 rows)
//
// Player spawn: pixel (312, 480) — centre-bottom of the room,
//   just above the exit strip.  Matches the canvas renderer's intSpawnX/Y.

export default class InteriorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'InteriorScene' });
  }

  // -------------------------------------------------------------------------
  preload() {
    // Tilemap JSON (fixed-size, non-infinite — converted from Interior1.tmj)
    this.load.tilemapTiledJSON('interior', 'assets/Interior1_fixed.tmj');

    // Tileset spritesheets — key must match the "name" field inside the TMJ
    this.load.image('walls_floor',             'assets/walls_floor.png');
    this.load.image('Interior',                'assets/Interior.png');
    this.load.image('Doors_windows_animation', 'assets/Doors_windows_animation.png');

    // Player spritesheet (idle + run frames from the CraftPix character folder)
    // Frame size 64×64, 4 idle frames, 6 run frames — adjust if different.
    this.load.spritesheet('char_idle', 'assets/char/idle/idle_strip.png',
      { frameWidth: 64, frameHeight: 64, endFrame: 3 });
    this.load.spritesheet('char_run',  'assets/char/run/run_strip.png',
      { frameWidth: 64, frameHeight: 64, endFrame: 5 });
  }

  // -------------------------------------------------------------------------
  create() {
    // --- Tilemap ----------------------------------------------------------
    const map = this.make.tilemap({ key: 'interior' });

    // addTilesetImage(nameInTMJ, imageKey)
    const tsWalls  = map.addTilesetImage('walls_floor',             'walls_floor');
    const tsInt    = map.addTilesetImage('Interior',                'Interior');
    const tsDoors  = map.addTilesetImage('Doors_windows_animation', 'Doors_windows_animation');
    const allSets  = [tsWalls, tsInt, tsDoors];

    // Layers — drawn bottom-up; depth set explicitly for Y-sort later
    const layerFloor   = map.createLayer('Floor',        allSets, 0, 0);
    const layerDetail  = map.createLayer('Tile Layer 6', allSets, 0, 0);
    const layerBoxes   = map.createLayer('Boxes',        allSets, 0, 0);
    const layerWalls   = map.createLayer('Walls',        allSets, 0, 0);
    const layerWindows = map.createLayer('Windows',      allSets, 0, 0);
    const layerObj1    = map.createLayer('Objects1',     allSets, 0, 0);
    const layerObj2    = map.createLayer('Objects2',     allSets, 0, 0);

    // Collision: every non-empty tile in the Walls layer blocks movement
    layerWalls.setCollisionByExclusion([-1]);

    // --- Camera -----------------------------------------------------------
    const mapW = map.widthInPixels;   // 624
    const mapH = map.heightInPixels;  // 528
    this.cameras.main.setBounds(0, 0, mapW, mapH);

    // --- Player spawn -----------------------------------------------------
    // Centre-bottom of the room (content px 312, 480), one tile above the
    // exit strip at y = mapH - 24 = 504.
    const SPAWN_X = 312;
    const SPAWN_Y = 480;

    this.player = this.physics.add.sprite(SPAWN_X, SPAWN_Y, 'char_idle');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);         // above floor tiles, below Objects2

    // Crisp pixel art — disable default linear filtering
    this.textures.get('char_idle').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('char_run').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Physics collision with wall tiles
    this.physics.add.collider(this.player, layerWalls);

    // Camera follows player, clamped to map bounds
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // --- Animations -------------------------------------------------------
    this.anims.create({
      key: 'idle',
      frames: this.anims.generateFrameNumbers('char_idle', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('char_run', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });
    this.player.anims.play('idle');

    // --- Input ------------------------------------------------------------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // --- Exit zone --------------------------------------------------------
    // Bottom 1.5-tile strip (y ≥ 504).  Player pressing E here returns to exterior.
    const exitKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    exitKey.on('down', () => {
      if (this.player.y >= mapH - 24) {
        this.scene.start('ExteriorScene');
      }
    });

    // Store for update()
    this._mapH = mapH;
  }

  // -------------------------------------------------------------------------
  update() {
    const { cursors, wasd, player } = this;
    const SPEED = 70;

    let vx = 0, vy = 0;
    if (cursors.left.isDown  || wasd.left.isDown)  vx = -SPEED;
    if (cursors.right.isDown || wasd.right.isDown) vx =  SPEED;
    if (cursors.up.isDown    || wasd.up.isDown)    vy = -SPEED;
    if (cursors.down.isDown  || wasd.down.isDown)  vy =  SPEED;

    // Normalise diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }

    player.setVelocity(vx, vy);

    if (vx !== 0 || vy !== 0) {
      player.anims.play('run', true);
      player.setFlipX(vx < 0);
    } else {
      player.anims.play('idle', true);
    }
  }
}
