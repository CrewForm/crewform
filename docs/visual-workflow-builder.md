---
title: 'Visual Workflow Builder'
description: 'Interactive canvas for building, visualizing, and monitoring multi-agent workflows in real-time.'
---

# Visual Workflow Builder

CrewForm's Visual Workflow Builder transforms the team configuration experience from static forms into an interactive, real-time orchestration dashboard. Built on React Flow, it provides drag-and-drop agent placement, live execution visualization, and deep observability tools.

## Overview

The Visual Workflow Builder is available on any Team page via the **Canvas** tab. It supports all three team modes:

| Mode | Layout | Description |
|------|--------|-------------|
| **Pipeline** | Top-to-Bottom | Sequential chain of agent steps |
| **Orchestrator** | Top-to-Bottom (wider) | Brain agent delegates to workers |
| **Collaboration** | Left-to-Right | Agents discuss in parallel |

## Getting Started

1. Navigate to any Team and switch to the **Canvas** tab
2. **Drag agents** from the sidebar palette onto the canvas
3. **Connect nodes** by dragging from a node's bottom handle to another node's top handle
4. The configuration **auto-saves** when you add, remove, or reorder nodes
5. Use **Auto-layout** (press `L`) to arrange nodes automatically

## Canvas Features

### Node Types

- **Start Node** - Entry point of the workflow (green, with breathing pulse animation)
- **Agent Nodes** - Represent individual agents with role badges (Brain/Worker/Reviewer)
- **Fan-Out Node** - Splits into parallel branches (labeled "fan-out" on the first edge)
- **Branch Agent Nodes** - Parallel agents that execute concurrently within a fan-out step
- **Merge Node** - Converges branch outputs back into a single result
- **End Node** - Terminal node of the workflow (red)

All nodes use **glassmorphism styling** with frosted glass backgrounds, backdrop blur, translucent borders, and hover lift effects.

### Fan-Out Visualization

When a pipeline includes [fan-out steps](/pipeline-teams#fan-out-parallel-branching), the canvas renders a branching pattern:

```
... → Previous Step → [Fan-Out] → Branch Agent A  ─┐
                                 → Branch Agent B  ─┤→ [Merge Agent] → Next Step → ...
                                 → Branch Agent C  ─┘
```

- The **fan-out node** splits into multiple parallel edges, each leading to a branch agent
- **Branch agents** appear as standard agent nodes, arranged side-by-side
- A **merge node** collects all branch outputs — this is the agent that synthesizes results
- During execution, each branch shows its **individual status** (Idle → Running → Completed/Failed)
- The merge node only starts executing once all branches (or surviving branches, depending on failure mode) complete

### Drag and Drop

Drag agents from the sidebar palette onto the canvas. The sidebar shows all agents in your workspace with:

- **Search and filter** - Appears automatically when you have more than five agents. Filter by name or model.
- **Agent count badge** - Shows filtered and total count
- **Drag handle** - Grab and drop agents directly onto the canvas

### Node Interaction

- **Click** a node to open the **Detail Popup**, which shows agent configuration, model, role, and execution status
- **Right-click** a node or the canvas background for a **Context Menu** with quick actions:
  - Delete node
  - Auto-layout
  - Set as Brain (orchestrator mode)
  - Fit View
  - Go to Agent

### Undo and Redo

Full undo/redo support with a 30-entry history stack. Any node addition, deletion, or repositioning can be undone.

---

## Live Execution Visualization

When a team run is active, the canvas transforms into a live monitoring dashboard:

### Execution States

Each agent node shows its current state in real-time:

| State | Visual | Description |
|-------|--------|-------------|
| **Idle** | Default styling | Waiting to execute |
| **Running** | Blue pulsing border glow and spinner badge | Currently processing |
| **Completed** | Green border and checkmark badge | Finished successfully |
| **Failed** | Red border and error badge | Encountered an error |

### Camera Auto-Follow

When a run is active, the canvas **automatically pans** to the currently executing agent node with smooth, debounced transitions. Toggle this behavior with the camera button in the toolbar.

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

Toggle with the transcript button in the toolbar or press `T`.

A real-time message feed showing inter-agent communication during execution:

- **Color-coded** by agent (each agent gets a unique color)
- **Filter buttons** - All, Delegations, Results, System
- **Tool call expansion** - Shows which tools were called, success or failure, and duration
- **Token count** per message
- **Auto-scroll** to the latest message
- **Live badge** - Shows a green pulse indicator during active runs

### Tool Activity Heatmap

Toggle with the activity button in the toolbar.

Aggregated tool and MCP usage statistics across the entire run:

- **Call count** per tool
- **Success rate** - Color-coded bar (green for high, amber for medium, red for low success rates)
- **Average duration** in milliseconds
- **Overall success rate** summary bar at the top
- Sorted by most-used tools

---

## Keyboard Shortcuts

Press `?` or click the keyboard button to view all shortcuts.

### Navigation

| Shortcut | Action |
|----------|--------|
| `F` | Fit view (zoom to fit all nodes) |
| `L` | Auto-layout (dagre-based arrangement) |
| Scroll | Zoom in and out |
| Drag | Pan canvas |

### Editing

| Shortcut | Action |
|----------|--------|
| `Cmd+Z` or `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` or `Ctrl+Shift+Z` | Redo |
| `Cmd+A` or `Ctrl+A` | Select all nodes |
| `Delete` | Remove selected node |

### Panels

| Shortcut | Action |
|----------|--------|
| `T` | Toggle transcript panel |
| `?` | Toggle keyboard shortcuts overlay |
| `Escape` | Close all panels or deselect |

---

## Toolbar

The info panel toolbar at the top-left shows:

- **Mode label** - Pipeline, Orchestrator, or Collaboration
- **Agent count** - Number of agent nodes on the canvas
- **Saving indicator** - Animated text during auto-save
- **Undo and Redo** buttons with enabled and disabled states
- **Auto-layout** button
- **Camera follow** toggle (during active runs)
- **Transcript** toggle (during active runs)
- **Tool activity** toggle (during active runs)
- **Keyboard shortcuts** button

---

## Configuration

The canvas reads and writes to the team's configuration object. When you add, remove, or reorder nodes, the configuration is validated and saved:

- **Pipeline** - Updates `agent_order` array
- **Orchestrator** - Updates `brain_agent_id` and `worker_agent_ids`
- **Collaboration** - Updates `participant_agent_ids`

Invalid configurations (such as disconnected nodes or a missing brain) show an error toast that auto-dismisses.

## Design System

All canvas overlays, including popups, context menus, and panels, follow a consistent **glassmorphism** design language:

- Backdrop blur for frosted glass effect
- Semi-transparent backgrounds
- Subtle borders
- Smooth entry animations with scale and opacity transitions
- Consistent with CrewForm's dark theme aesthetic
