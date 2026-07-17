// Hotspots in the exterior scene. Two types:
//   type: 'enter'  — triggers a scene transition (onEnter callback), no panel.
//   type: 'panel'  — opens the pixel-styled info panel (default when type omitted).

export const HOTSPOTS = [
  {
    id: 'door',
    type: 'enter',
    zone: [220, 148, 254, 186],   // girl's feet must be inside
    anchor: [237, 150],           // floating prompt position (door top)
    label: 'Enter',
  },
];

// Interior hotspots — all type 'panel'. Zones/anchors in the 624×528 world
// (1:1 with the 39×33-tile content area; origin = abs tile 19,4).
// Formula: world_x = (abs_tile_x - 19)*16, world_y = (abs_tile_y - 4)*16.
export const INTERIOR_HOTSPOTS = [
  {
    id: 'about',
    type: 'panel',
    // Near dining table (center). Abs tiles x=36-43, y=16-17 — walkable.
    zone: [272, 192, 384, 224],
    anchor: [328, 184],
    label: 'Interact',
    title: 'ABOUT ME',
    body: `<p>Hi — I'm <b>Rhythm Sharma</b>, UI/UX and Product Designer based in Berlin, Germany.</p>
<p>3+ years designing SaaS platforms, developer tools, and API management systems — end-to-end, from research through developer handoff.</p>
<p>I work directly with founders and C-level teams in agile environments, and use AI-augmented workflows (Claude Code, MCP servers, GitHub) to bridge design and engineering.</p>
<p>Currently at <b>AtomFlo</b>, designing a multi-module SaaS workspace from scratch.</p>`,
  },
  {
    id: 'projects',
    type: 'panel',
    // Reachable corridor just below the bookshelf wall (content row 8, cols 19-24).
    // The bookshelf room itself is walled off; the player interacts from here.
    zone: [304, 128, 384, 144],
    anchor: [344, 120],
    label: 'View',
    title: 'PROJECTS',
    body: `<p><b>AtomFlo — All-in-One SaaS Workspace</b> (2025–now)<br>
Onboarding flows, dashboard layouts across 8 modules, AI feature interfaces, full Figma component library.</p>
<p><b>API Management Platform</b><br>
API explorer UI, key auth &amp; scoping, usage analytics dashboard, rate limiting screens, developer onboarding.</p>
<p><b>Work Safety — Asset Management System</b><br>
Live monitoring dashboard, SOS alert flow, real-time location and environmental data layout.</p>
<p><b>The Square — Real Estate Landing Page</b><br>
Responsive landing: property highlights, amenities, CTA hierarchy across desktop and mobile.<br>
Live: <a href="https://thesquare.irarealty.in" target="_blank">thesquare.irarealty.in</a></p>`,
  },
  {
    id: 'skills',
    type: 'panel',
    // Left corridor (content row 8, cols 10-14) — reachable floor inside the room.
    zone: [160, 128, 240, 144],
    anchor: [200, 120],
    label: 'View',
    title: 'SKILLS',
    body: `<p><b>Design</b><br>
UI/UX · Interaction Design · Design Systems · Information Architecture · User Research &amp; Usability Testing · Wireframing &amp; Prototyping · Responsive Design · Accessibility · Design Handoff</p>
<p><b>Tools</b><br>
Figma (Advanced) · Framer · Adobe Illustrator</p>
<p><b>Technical Domain</b><br>
SaaS Product Design · API &amp; Developer Tool UX · AI-Augmented Workflows · Claude Code &amp; MCP Servers · GitHub &amp; Open Source</p>`,
  },
  {
    id: 'contact',
    type: 'panel',
    // Right-center (near arched doorway/garden). Abs tiles x=39-44, y=10-12 — walkable.
    zone: [320, 96, 400, 128],
    anchor: [360, 88],
    label: 'Connect',
    title: 'CONTACT',
    body: `<p>Email: <a href="mailto:rhyths.sharma@gmail.com">rhyths.sharma@gmail.com</a></p>
<p>Phone: +49 152 22093453</p>
<p>Location: Berlin, Germany</p>
<p>Portfolio &nbsp;·&nbsp; LinkedIn &nbsp;·&nbsp; Behance</p>
<p>Languages: English (Fluent) · German (A1) · Hindi (Native)</p>`,
  },
];

export class Interactions {
  // refs: { W, H, prompt, panel, panelTitle, panelBody, panelClose }
  // onEnter(hotspot): called when an 'enter'-type hotspot is activated
  constructor(refs, onEnter) {
    this.refs = refs;
    this.onEnter = onEnter || null;
    this.active = null;
    this.open = false;
    this._bind();
  }

  get isOpen() { return this.open; }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) { this.close(); e.preventDefault(); return; }
      if (!this.open && this.active && (e.key === 'e' || e.key === 'E' || e.key === 'Enter')) {
        if (this.active.type === 'enter') {
          if (this.onEnter) this.onEnter(this.active);
        } else {
          this.openPanel(this.active);
        }
        e.preventDefault();
      }
    });
    this.refs.panelClose.addEventListener('click', () => this.close());
    this.refs.panel.addEventListener('click', (e) => {
      if (e.target === this.refs.panel) this.close();
    });
  }

  // Called each frame with the girl's ground position in the exterior scene.
  update(girl) {
    this._checkHotspots(HOTSPOTS, girl);
  }

  // Called each frame with the girl's ground position in the interior scene.
  updateInterior(girl) {
    this._checkHotspots(INTERIOR_HOTSPOTS, girl);
  }

  _checkHotspots(list, girl) {
    const fx = girl.x, fy = girl.y;
    let found = null;
    for (const h of list) {
      const [x0, y0, x1, y1] = h.zone;
      if (fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1) { found = h; break; }
    }
    this.active = found;

    const p = this.refs.prompt;
    if (found && !this.open) {
      const [ax, ay] = found.anchor;
      if (this.refs.anchorCSS) {
        const [l, t] = this.refs.anchorCSS(ax, ay);
        p.style.left = l; p.style.top = t;
      } else {
        p.style.left = (ax / this.refs.W) * 100 + '%';
        p.style.top  = (ay / this.refs.H) * 100 + '%';
      }
      p.querySelector('.prompt-label').textContent = found.label || 'Interact';
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
