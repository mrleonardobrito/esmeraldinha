declare module "vue3-smooth-dnd" {
  import type { DefineComponent } from "vue";

  export interface DropResult<T = any> {
    removedIndex: number | null;
    addedIndex: number | null;
    payload?: T;
    element?: HTMLElement;
    addedToContainerId?: string | null;
    removedFromContainerId?: string | null;
    position?: {
      x: number;
      y: number;
    };
    size?: {
      width: number;
      height: number;
    };
  }

  export const Container: DefineComponent<Record<string, unknown>>;
  export const Draggable: DefineComponent<Record<string, unknown>>;
}

