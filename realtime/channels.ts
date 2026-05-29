export const REALTIME_CHANNELS = {
  WORKSPACE:      (wsId: string)   => `workspace:${wsId}`,
  CONVERSATION:   (convId: string) => `conversation:${convId}`,
  AGENT_PRESENCE: (wsId: string)   => `presence:agents:${wsId}`,
  NOTIFICATIONS:  (userId: string) => `notifications:${userId}`,
  CAMPAIGN:       (campId: string) => `campaign:${campId}`,
} as const;

export type RealtimeChannelName = ReturnType<
  (typeof REALTIME_CHANNELS)[keyof typeof REALTIME_CHANNELS]
>;
