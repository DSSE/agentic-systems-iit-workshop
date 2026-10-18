export type RuleCode =
  | "INVALID_TIME_RANGE"
  | "MAX_DURATION_EXCEEDED"
  | "ROOM_NOT_FOUND"
  | "INVALID_GROUP_SIZE"
  | "CAPACITY_EXCEEDED"
  | "START_IN_PAST"
  | "BOOKING_OVERLAP"
  | "NO_ROOM_AVAILABLE"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_EXPIRED";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  note: string;
}

export interface Booking {
  id: string;
  room_id: string;
  start: string;
  end: string;
  group_size: number;
  booked_by: string;
  purpose: string;
  source: string;
  created_at: string;
}

export interface Slot {
  room_id: string;
  start: string;
  end: string;
}

export interface RuleResult {
  ok: boolean;
  rule_code: RuleCode | null;
  message: string;
  suggestion: Slot | null;
}

export interface Proposal {
  proposal_id: string;
  status: "pending_approval";
  room_id: string;
  room_name: string;
  start: string;
  end: string;
  group_size: number;
  booked_by: string;
  purpose: string;
  source: string;
  created_at: string;
  expires_at: string;
}

export interface Availability {
  result: RuleResult;
  free_rooms: Room[];
}

export interface BookingInput {
  room_id: string;
  start: string;
  end: string;
  group_size: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  reply: string;
  proposals: Proposal[];
}
