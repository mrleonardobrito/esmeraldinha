declare module 'vue3-smooth-dnd' {
  import type { DefineComponent } from 'vue'
  import type { DropResult, DropPlaceholderOptions } from 'smooth-dnd'

  export interface ContainerProps {
    behaviour?: 'move' | 'copy' | 'drop-zone'
    groupName?: string
    orientation?: 'horizontal' | 'vertical'
    dragHandleSelector?: string
    nonDragAreaSelector?: string
    dragBeginDelay?: number
    animationDuration?: number
    autoScrollEnabled?: boolean
    dropPlaceholder?: DropPlaceholderOptions | boolean
    getChildPayload?: (index: number) => unknown
    onDrop?: (dropResult: DropResult) => void
  }

  export const Container: DefineComponent<ContainerProps>
  export const Draggable: DefineComponent<Record<string, unknown>>
}
