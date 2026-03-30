---
title: "Visual Workflow Builder"
description: "Interactive canvas for building, visualizing, and monitoring multi-agent workflows in real-time."
---

# Visual Workflow Builder

CrewForm's Visual Workflow Builder transforms the team configuration experience from static forms into an interactive, real-time orchestration dashboard. Built on React Flow, it provides drag-and-drop agent placement, live execution visualization, and deep observability tools — all within a glassmorphism-styled interface.

## Overview

The Visual Workflow Builder is available on any Team page via the **Canvas** tab. It supports all three team modes:

| Mode | Layout | Description |
|------|--------|-------------|
| **Pipeline** | Top → Bottom | Sequential chain of agent steps |
| **Orchestrator** | Top → Bottom (wider) | Brain agent delegates to workers |
| **Collaboration** | Left → Right | Agents discuss in parallel |

## Getting Started

1. Navigate to any Team and switch to the **Canvas** tab
2. **Drag agents** from the sidebar palette onto the canvas
3. **Connect nodes** by dragging from a node's bottom handle to another node's top handle
4. The configuration **auto-saves** when you add, remove, or reorder nodes
5. Use **Auto-layout** (`L` key) to arrange nodes automatically

## Canvas Features

### Node Types

- **Start Node** — Entry point of the workflow (green, with breathing pulse animation)
- **Agent Nodes** — Represent individual agents with role badges (Brain/Worker/Reviewer)
- **End Node** — Terminal node of the workflow (red)

All nodes use **glassmorphism styling** — frosted glass backgrounds with backdrop blur, translucent borders, and hover lift effects — creating a premium, depth-rich visual experience.

### Drag & Drop

Drag agents from the sidebar palette onto the canvas. The sidebar shows all agents in your workspace with:

- **Search/filter** — Appears automatically when you have more than 5 agents. Filter by name or model.
- **Agent count badge** — Shows `filtered/total` count
- **Drag handle** — Grab and drop agents directly onto the canvas

### Node Interaction

- **Click** a node to open the **Detail Popup** — shows agent configuration, model, role, and execution status
- **Right-click** a node or the canvas background for a **Context Menu** with quick actions:
  - Delete node
  - Auto-layout
  - Set as Brain (orchestrator mode)
  - Fit View
  - Go to Agent

### Undo/Redo

Full undo/redo support with a 30-entry history stack. Any node addition, deletion, or repositioning can be undone.

---

## Live Execution Visualization

When a team run is active, the canvas transforms into a live monitoring dashboard:

### Execution States

Each agent node shows its current state in real-time:

| State | Visual | Description |
|-------|--------|-------------|
| **Idle** | Default styling | Waiting to execute |
| **Running** | Blue pulsing border glow + spinner badge | Currently processing |
| **Completed** | Green border + ✓ badge | Finished successfully |
| **Failed** | Red border + ✕ badge | Encountered an error |

### Camera Auto-Follow

When a run is active, the canvas **automatically pans** to the currently executing agent node with smooth, debounced transitions. Toggle this behavior with the 📍 button in the toolbar.

### Execution Timeline

A horizontal progress rail appears below the canvas during runs, showing:

- Step-by-step progress with status indicators
- Click any step to **pan the camera** to that agent node
- Real-time updates as agents start and complete

### Animated Edges

During execution, edges animate with a flowing dashed pattern to indicate the direction of data flow between agents.

---

## Observability Panels

### Transcript Panel

Toggle with the 💬 button in the toolbar or press `T`.

A real-time message feed showing inter-agent communication during execution:

- **Color-coded** by agent (each agent gets a unique color)
- **Filter buttons** — All | Delegations | Results | System
- **Tool call expansion** — Shows which tools were called, success/failure, and duration
- **Token count** per message
- **Auto-scroll** to the latest message
- **Live badge** — Shows a green pulse indicator during active runs

### Tool Activity Heatmap

Toggle with the 📊 button in the toolbar.

Aggregated tool/MCP usage statistics across the entire run:

- **Call count** per tool
- **Success rate** — Color-coded bar (green >90%, amber 70-90%, red <70%)
- **Average duration** in milliseconds
- **Overall success rate** summary bar at the top
- Sorted by most-used tools

---

## Keyboard Shortcuts

Press `?` or click the ⌨ button to view all shortcuts.

### Navigation

| Shortcut | Action |
|----------|--------|
| `F` | Fit view (zoom to fit all nodes) |
| `L` | Auto-layout (dagre-based arrangement) |
| Scroll | Zoom in/out |
| Drag | Pan canvas |

### Editing

| Shortcut | Action |
|----------|--------|
| `⌘ Z` / `Ctrl+Z` | Undo |
| `⌘ ⇧ Z` / `Ctrl+Shift+Z` | Redo |
| `⌘ A` / `Ctrl+A` | Select all nodes |
| `Delete` | Remove selected node |

### Panels

| Shortcut | Action |
|----------|--------|
| `T` | Toggle transcript panel |
| `?` | Toggle keyboard shortcuts overlay |
| `Escape` | Close all panels / deselect |

---

## Toolbar

The info panel toolbar at the top-left shows:

- **Mode label** — Pipeline / Orchestrator / Collaboration
- **Agent count** — Number of agent nodes on the canvas
- **Saving indicator** — Animated "Saving…" text during auto-save
- **Undo / Redo** buttons with enabled/disabled states
- **Auto-layout** button
- **Camera follow** toggle (during active runs)
- **Transcript** toggle (during active runs)
- **Tool activity** toggle (during active runs)
- **Keyboard shortcuts** `⌨` button

---

## Configuration

The canvas reads and writes to the team's configuration object. When you add, remove, or reorder nodes, the configuration is validated and saved:

- **Pipeline** — Updates `agent_order` array
- **Orchestrator** — Updates `brain_agent_id` and `worker_agent_ids`
- **Collaboration** — Updates `participant_agent_ids`

Invalid configurations (e.g., disconnected nodes, missing brain) show an error toast that auto-dismisses.

## Design System

All canvas overlays — popups, context menus, panels — follow a consistent **glassmorphism** design language:

- `backdrop-filter: blur(12px)` for frosted glass effect
- `rgba(26, 26, 26, 0.75)` semi-transparent backgrounds
- `border-white/5` subtle borders
- Smooth entry animations with scale + opacity transitions
- Consistent with CrewForm's dark theme aesthetic

<!-- v1.7.0 -->
