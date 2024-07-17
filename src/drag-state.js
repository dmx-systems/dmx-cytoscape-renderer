/**
 * Maintains state for dragging a node and hovering other nodes.
 */
export default class DragState {

  constructor (node, iaHandler) {
    this.node = node              // the dragged node
    this.nodePosition = {         // the dragged node's original position. Note: a new pos object must be created.
      x: node.position('x'),
      y: node.position('y')
    }
    this.hoverNode = undefined    // the node hovered while dragging
    this.iaHandler = iaHandler
  }

  hover () {
    this.iaHandler.addClass(this.hoverNode.id(), 'hover')
  }

  unhover () {
    this.iaHandler.removeClass(this.hoverNode.id(), 'hover')
  }

  resetPosition () {
    this.node.animate({
      position: this.nodePosition,
      easing: 'ease-in-out-cubic',
      duration: 200
    })
    this.iaHandler.nodeMoved(this.node.id(), this.nodePosition)   // TODO: update position continuously while animation
  }

  dragged () {
    return this.nodePosition.x !== this.node.position('x') ||
           this.nodePosition.y !== this.node.position('y')
  }
}
