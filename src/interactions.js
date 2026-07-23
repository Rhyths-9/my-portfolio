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
    id: 'skills',
    type: 'panel',
    // Whole dining table + the walkable ring around it (content cols 16-26,
    // rows 9-16) so the prompt stays up as the character circles the table.
    // Stops at row 9 so it doesn't overlap projects/contact just above (row 6-8).
    zone: [256, 144, 416, 256],
    anchor: [336, 176],
    label: 'What I bring to the table',
    title: 'WHAT I BRING TO THE TABLE',
    body: `<p><b>Design</b><br>
UI/UX · Interaction Design · Design Systems · Information Architecture · User Research &amp; Usability Testing · Wireframing &amp; Prototyping · Responsive Design · Accessibility · Design Handoff</p>
<p><b>Tools</b><br>
Figma (Advanced) · Framer · Adobe Illustrator</p>
<p><b>Technical Domain</b><br>
SaaS Product Design · API &amp; Developer Tool UX · AI-Augmented Workflows · Claude Code &amp; MCP Servers · GitHub &amp; Open Source</p>`,
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
    id: 'about',
    type: 'panel',
    // Potions room — near the cauldron/potion table (content cols 8-9, rows 17-18).
    // Zone covers the room's walkable floor near the table (cols 9-14, rows 15-18).
    zone: [144, 240, 224, 288],
    anchor: [176, 264],
    label: 'About me',
    title: 'ABOUT ME',
    body: `<p>I'm <b>Rhythm Sharma</b>, a UI/UX and Product Designer based in Berlin who blends interface design, product thinking, and design systems into work that feels both usable and purposeful. Over 3+ years I've designed SaaS platforms, developer tools, and API management systems end-to-end — from research and wireframes through to developer handoff — working directly with founders and C-level teams in fast-moving agile environments. I bring a rare mix of visual craft, systems thinking, and AI-augmented workflows (Claude Code, MCP servers, GitHub) that bridge the gap between design and engineering. From onboarding flows to complex dashboards, every project reflects a strong focus on clarity, attention to detail, and real user needs. Currently I'm at <b>AtomFlo</b>, designing a multi-module SaaS workspace from scratch.</p>`,
  },
  {
    id: 'contact',
    type: 'panel',
    // Right at the bedside table with the telephone (nightstand at content col 18,
    // rows 3-4). Tight zone: directly in front of / beside it (cols 18-19, rows 4-6).
    zone: [288, 64, 320, 96],
    anchor: [296, 80],
    label: 'Connect',
    title: 'CONTACT',
    body: `<p>Email: <a href="mailto:rhyths.sharma@gmail.com">rhyths.sharma@gmail.com</a></p>
<p>Phone: +49 152 22093453</p>
<p>Location: Berlin, Germany</p>
<p>Portfolio: <a href="https://www.behance.net/rhythm-sharma" target="_blank">behance.net/rhythm-sharma</a></p>
<p>LinkedIn: <a href="https://www.linkedin.com/in/rhythmss" target="_blank">linkedin.com/in/rhythmss</a></p>`,
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
  // The prompt hovers over the character (not a fixed hotspot anchor).
  updateInterior(girl) {
    this._checkHotspots(INTERIOR_HOTSPOTS, girl, true);
  }

  _checkHotspots(list, girl, overChar = false) {
    const fx = girl.x, fy = girl.y;
    let found = null;
    for (const h of list) {
      const [x0, y0, x1, y1] = h.zone;
      if (fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1) { found = h; break; }
    }
    this.active = found;

    const p = this.refs.prompt;
    if (found && !this.open) {
      // Float over the character's head in the interior; over the hotspot anchor otherwise.
      const [ax, ay] = overChar ? [girl.x, girl.y - 40] : found.anchor;
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
