import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface TypingUser {
  user_id: string;
  conversation_id: string;
}

interface ConversationState {
  activeConversationId: string | null;
  typingUsers: TypingUser[];
  replyToMessageId: string | null;
  setActiveConversation: (id: string | null) => void;
  setTyping: (userId: string, conversationId: string, isTyping: boolean) => void;
  setReplyTo: (messageId: string | null) => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>()(
  devtools(
    (set) => ({
      activeConversationId: null,
      typingUsers:          [],
      replyToMessageId:     null,

      setActiveConversation: (id) =>
        set({ activeConversationId: id }, false, 'conversation/setActive'),

      setTyping: (userId, conversationId, isTyping) =>
        set(
          (state) => ({
            typingUsers: isTyping
              ? [
                  ...state.typingUsers.filter((t) => t.user_id !== userId),
                  { user_id: userId, conversation_id: conversationId },
                ]
              : state.typingUsers.filter((t) => t.user_id !== userId),
          }),
          false,
          'conversation/setTyping'
        ),

      setReplyTo: (messageId) =>
        set({ replyToMessageId: messageId }, false, 'conversation/setReplyTo'),

      reset: () =>
        set(
          { activeConversationId: null, typingUsers: [], replyToMessageId: null },
          false,
          'conversation/reset'
        ),
    }),
    { name: 'ConversationStore' }
  )
);
