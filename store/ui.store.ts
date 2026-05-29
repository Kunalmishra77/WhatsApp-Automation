import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type ModalId =
  | 'newConversation'
  | 'newContact'
  | 'newCampaign'
  | 'newLead'
  | 'mediaPreview'
  | null;

interface UIState {
  sidebarCollapsed: boolean;
  activeModal: ModalId;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modal: ModalId) => void;
  closeModal: () => void;
  toggleCommandPalette: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      sidebarCollapsed:   false,
      activeModal:        null,
      commandPaletteOpen: false,
      theme:              'system',

      toggleSidebar:       () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'ui/toggleSidebar'),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }, false, 'ui/setSidebar'),
      openModal:           (modal) => set({ activeModal: modal }, false, 'ui/openModal'),
      closeModal:          () => set({ activeModal: null }, false, 'ui/closeModal'),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen }), false, 'ui/togglePalette'),
      setTheme:            (theme) => set({ theme }, false, 'ui/setTheme'),
    }),
    { name: 'UIStore' }
  )
);
