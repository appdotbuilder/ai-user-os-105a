import { db } from '../db';
import { agentEventsTable } from '../db/schema';
import { type GetAgentEventsQuery, type AgentEvent } from '../schema';
import { eq, and, desc, type SQL } from 'drizzle-orm';

export const getAgentEvents = async (input: GetAgentEventsQuery): Promise<AgentEvent[]> => {
  try {
    // Start with base query
    let baseQuery = db.select().from(agentEventsTable);

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];
    
    // Always filter by workspace_id (required)
    conditions.push(eq(agentEventsTable.workspace_id, input.workspace_id));

    // Add optional filters
    if (input.status) {
      conditions.push(eq(agentEventsTable.status, input.status));
    }

    if (input.agent) {
      conditions.push(eq(agentEventsTable.agent, input.agent));
    }

    // Apply where conditions and ordering
    const query = baseQuery
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(agentEventsTable.created_at));

    const results = await query.execute();

    // Cast input and output fields to proper types
    return results.map(event => ({
      ...event,
      input: event.input as Record<string, any>,
      output: event.output as Record<string, any>
    }));
  } catch (error) {
    console.error('Failed to fetch agent events:', error);
    throw error;
  }
};