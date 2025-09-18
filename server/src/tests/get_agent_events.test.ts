import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, agentEventsTable } from '../db/schema';
import { type GetAgentEventsQuery } from '../schema';
import { getAgentEvents } from '../handlers/get_agent_events';
import { eq } from 'drizzle-orm';

describe('getAgentEvents', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'UTC',
        llm_provider: 'openai',
        llm_model: 'gpt-4'
      })
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Test Workspace',
        settings: { theme: 'dark' }
      })
      .returning()
      .execute();
    workspaceId = workspaceResult[0].id;
  });

  it('should return agent events for workspace', async () => {
    // Create test agent events
    await db.insert(agentEventsTable).values([
      {
        workspace_id: workspaceId,
        agent: 'task_creator',
        action: 'create_task',
        input: { title: 'New Task', description: 'Task description' },
        output: { task_id: 'task-123' },
        status: 'executed'
      },
      {
        workspace_id: workspaceId,
        agent: 'reminder_scheduler',
        action: 'schedule_reminder',
        input: { task_id: 'task-123', remind_at: '2024-01-15T10:00:00Z' },
        output: { reminder_id: 'reminder-456' },
        status: 'draft'
      }
    ]).execute();

    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(2);
    
    // Verify all results have required fields
    result.forEach(event => {
      expect(event.id).toBeDefined();
      expect(event.workspace_id).toEqual(workspaceId);
      expect(event.created_at).toBeInstanceOf(Date);
      expect(event.agent).toBeDefined();
      expect(event.action).toBeDefined();
      expect(event.input).toBeDefined();
      expect(event.output).toBeDefined();
      expect(event.status).toBeDefined();
    });
  });

  it('should filter by status', async () => {
    // Create agent events with different statuses
    await db.insert(agentEventsTable).values([
      {
        workspace_id: workspaceId,
        agent: 'task_creator',
        action: 'create_task',
        input: { title: 'Draft Task' },
        output: {},
        status: 'draft'
      },
      {
        workspace_id: workspaceId,
        agent: 'task_creator',
        action: 'create_task',
        input: { title: 'Executed Task' },
        output: {},
        status: 'executed'
      }
    ]).execute();

    // Filter for draft status only
    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId,
      status: 'draft'
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(1);
    expect(result[0].status).toEqual('draft');
    expect(result[0].input).toEqual({ title: 'Draft Task' });
  });

  it('should filter by agent', async () => {
    // Create agent events with different agents
    await db.insert(agentEventsTable).values([
      {
        workspace_id: workspaceId,
        agent: 'task_creator',
        action: 'create_task',
        input: { title: 'Task Creator Event' },
        output: {}
      },
      {
        workspace_id: workspaceId,
        agent: 'reminder_scheduler',
        action: 'schedule_reminder',
        input: { task_id: 'task-123' },
        output: {}
      }
    ]).execute();

    // Filter for reminder_scheduler only
    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId,
      agent: 'reminder_scheduler'
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(1);
    expect(result[0].agent).toEqual('reminder_scheduler');
    expect(result[0].action).toEqual('schedule_reminder');
    expect(result[0].input).toEqual({ task_id: 'task-123' });
  });

  it('should return empty array when no events found', async () => {
    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle complex JSON input and output objects', async () => {
    const complexEvent = {
      workspace_id: workspaceId,
      agent: 'complex_processor',
      action: 'process_data',
      input: {
        nested: {
          data: ['item1', 'item2'],
          settings: {
            enabled: true,
            threshold: 0.85
          }
        },
        array: [1, 2, 3]
      },
      output: {
        results: {
          processed: 3,
          success: true,
          errors: []
        },
        metadata: {
          duration: '1.5s',
          memory: '128MB'
        }
      },
      status: 'executed' as const
    };

    await db.insert(agentEventsTable).values(complexEvent).execute();

    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(1);
    expect(result[0].input).toEqual(complexEvent.input);
    expect(result[0].output).toEqual(complexEvent.output);
    expect(result[0].agent).toEqual('complex_processor');
    expect(result[0].action).toEqual('process_data');
  });

  it('should order by created_at desc', async () => {
    // Create first event
    await db.insert(agentEventsTable).values({
      workspace_id: workspaceId,
      agent: 'first_agent',
      action: 'first_action',
      input: { order: 'first' },
      output: {},
      status: 'executed'
    }).execute();
    
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second event
    await db.insert(agentEventsTable).values({
      workspace_id: workspaceId,
      agent: 'second_agent',
      action: 'second_action',
      input: { order: 'second' },
      output: {},
      status: 'draft'
    }).execute();

    const query: GetAgentEventsQuery = {
      workspace_id: workspaceId
    };

    const result = await getAgentEvents(query);

    expect(result).toHaveLength(2);
    
    // Most recent should be first
    expect(result[0].agent).toEqual('second_agent');
    expect(result[0].input).toEqual({ order: 'second' });
    
    expect(result[1].agent).toEqual('first_agent');
    expect(result[1].input).toEqual({ order: 'first' });
  });
});