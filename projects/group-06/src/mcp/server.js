#!/usr/bin/env node
/**
 * SprintBoard Model Context Protocol (MCP) Server
 * Exposes list_tasks, check_capacity, and assign_task via standard JSON-RPC 2.0 over stdio.
 *
 * Invariants Enforced:
 * 1. Hard Rule: Max 8 story points per member (RULE_ERROR_CODE: ERR_MAX_POINTS_EXCEEDED).
 * 2. Human-in-the-Loop: assign_task without approved: true returns staged proposal;
 *    only approved: true commits to data.json.
 */

import readline from 'node:readline';
import { list_tasks, check_capacity, assign_task } from '../tools.js';
import { MAX_POINTS_PER_MEMBER, RULE_ERROR_CODE } from '../domain/rules.js';

// Server Metadata
const SERVER_NAME = "sprintboard";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

// Tool Definitions Catalog
const TOOLS = [
  {
    name: "list_tasks",
    description: "Returns the current sprint backlog tasks and team members with their point capacity and remaining allowance.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "check_capacity",
    description: "Evaluates whether assigning specified tasks to a team member exceeds the hard limit of 8 story points without mutating state.",
    inputSchema: {
      type: "object",
      properties: {
        memberName: {
          type: "string",
          description: "Name of the team member (e.g., 'Rafi', 'Sarah', 'Tanvir')"
        },
        taskIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of task IDs to check (e.g., ['task-1', 'task-2'])"
        }
      },
      required: ["memberName", "taskIds"]
    }
  },
  {
    name: "assign_task",
    description: "Stages a task assignment proposal, or saves to data.json if explicit human approval is provided. Hard rule: Refuses write unless approved is true.",
    inputSchema: {
      type: "object",
      properties: {
        memberName: {
          type: "string",
          description: "Target team member name"
        },
        taskIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of task IDs to assign"
        },
        approved: {
          type: "boolean",
          description: "Explicit human approval flag. Set to true ONLY if the human user has confirmed the assignment."
        }
      },
      required: ["memberName", "taskIds"]
    }
  }
];

/**
 * Sends a JSON-RPC response to stdout followed by a newline.
 * Note: stderr is used for logging so stdout remains pure JSON-RPC.
 */
function sendResponse(response) {
  const json = JSON.stringify(response);
  process.stdout.write(json + '\n');
}

function handleInitialize(id, params) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    }
  };
}

function handleToolsList(id) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      tools: TOOLS
    }
  };
}

function handleToolsCall(id, params) {
  const { name, arguments: args = {} } = params;

  try {
    if (name === "list_tasks") {
      const data = list_tasks();
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ],
          isError: false
        }
      };
    }

    if (name === "check_capacity") {
      const result = check_capacity(args.memberName, args.taskIds);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.allowed
        }
      };
    }

    if (name === "assign_task") {
      const isApproved = args.approved === true;
      const result = assign_task(args.memberName, args.taskIds, isApproved);

      let isError = false;
      let textOutput = '';

      if (!result.success && !result.staged) {
        // Hard rule violation or error
        isError = true;
        textOutput = `❌ ASSIGNMENT REFUSED: [${result.code || RULE_ERROR_CODE}] ${result.message}\n` +
          `Notice: No member may exceed ${MAX_POINTS_PER_MEMBER} story points. Suggest re-distributing tasks across other teammates.`;
      } else if (result.staged && !result.saved) {
        // Staged proposal awaiting human approval
        textOutput = `⏳ PROPOSAL STAGED (HUMAN APPROVAL REQUIRED):\n` +
          `• Member: ${result.proposal.memberName}\n` +
          `• Tasks: ${result.proposal.taskTitles.join(', ')} (${result.proposal.addedPoints} pts)\n` +
          `• Projected Total: ${result.proposal.projectedTotal} / ${MAX_POINTS_PER_MEMBER} pts\n\n` +
          `INSTRUCTION FOR AGENT: Nothing has been saved to data.json yet. Ask the human user for explicit approval ("y" / "approve"). Once approved, call assign_task again with approved: true.`;
      } else if (result.saved) {
        // Committed to data.json
        textOutput = `✅ ASSIGNMENT APPROVED & SAVED TO data.json:\n` +
          `• Member: ${result.member.name} now has ${result.member.currentPoints}/${MAX_POINTS_PER_MEMBER} points.\n` +
          `• Tasks Assigned: ${result.assignedTasks.map(t => `${t.title} (${t.points} pts)`).join(', ')}`;
      }

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: textOutput
            }
          ],
          isError
        }
      };
    }

    // Unknown tool
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Unknown tool: ${name}`
      }
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Tool execution error: ${err.message}`
          }
        ],
        isError: true
      }
    };
  }
}

/**
 * Main stdio listener loop
 */
export function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const message = JSON.parse(trimmed);
      const { id, method, params } = message;

      // Notifications (no id)
      if (id === undefined || id === null) {
        if (method === "notifications/initialized") {
          // Client acknowledged initialization
          return;
        }
        return;
      }

      // Requests with ID
      if (method === "initialize") {
        sendResponse(handleInitialize(id, params));
      } else if (method === "tools/list") {
        sendResponse(handleToolsList(id));
      } else if (method === "tools/call") {
        sendResponse(handleToolsCall(id, params));
      } else if (method === "ping") {
        sendResponse({ jsonrpc: "2.0", id, result: {} });
      } else {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
      }
    } catch (err) {
      sendResponse({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`
        }
      });
    }
  });

  process.stderr.write(`[MCP] SprintBoard MCP Server started over stdio.\n`);
}

// Start if executed directly
const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun) {
  startMcpServer();
}
