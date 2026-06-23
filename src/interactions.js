// Hotspots in the scene the girl can walk up to and "enter" (press E) to open a
// pixel-styled section panel. Coordinates are in native canvas pixels.
//
// To add more later (e.g. the well -> Contact, a sign -> Work), append to
// HOTSPOTS with a zone rectangle, a prompt anchor, and the panel content.

export const HOTSPOTS = [
  {
    id: 'about',
    zone: [220, 148, 254, 186],   // [x0,y0,x1,y1] the girl's feet must be inside
    anchor: [237, 150],           // where the floating prompt sits (door top)
    title: 'ABOUT ME',
    body: `
      <p><strong>Hi, I'm Rhythm Sharma</strong> — a UI/UX designer who likes
      turning messy problems into calm, playful interfaces.</p>
      <p>This little world is my portfolio. Wander around with the dog, and
      step up to things to peek inside.</p>
      <p><em>More rooms (Work, Contact) opening soon.</em></p>
    `,
  },
];

export class Interactions {
  // refs: { W, H, prompt, promptLabel, panel, panelTitle, panelBody, panelClose }
  constructor(refs) {
    this.refs = refs;
    this.active = null;   // hotspot the girl is standing in
    this.open = false;    // is a panel showing
    this._bind();
  }

  get isOpen() { return this.open; }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) { this.close(); e.preventDefault(); return; }
      if (!this.open && this.active && (e.key === 'e' || e.key === 'E' || e.key === 'Enter')) {
        this.openPanel(this.active);
        e.preventDefault();
      }
    });
    this.refs.panelClose.addEventListener('click', () => this.close());
    this.refs.panel.addEventListener('click', (e) => {
      if (e.target === this.refs.panel) this.close(); // click backdrop
    });
  }

  // Called each frame with the girl's ground position.
  update(girl) {
    const fx = girl.x, fy = girl.y;
    let found = null;
    for (const h of HOTSPOTS) {
      const [x0, y0, x1, y1] = h.zone;
      if (fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1) { found = h; break; }
    }
    this.active = found;

    const p = this.refs.prompt;
    if (found && !this.open) {
      const [ax, ay] = found.anchor;
      p.style.left = (ax / this.refs.W) * 100 + '%';
      p.style.top = (ay / this.refs.H) * 100 + '%';
      p.hidden = false;
    } else {
      p.hidden = true;
    }
  }

  openPanel(h) {
    this.refs.panelTitle.textContent = h.title;
    this.refs.panelBody.innerHTML = h.body;
    this.refs.panel.hidden = false;
    this.refs.prompt.hidden = true;
    this.open = true;
  }

  close() {
    this.refs.panel.hidden = true;
    this.open = false;
  }
}
