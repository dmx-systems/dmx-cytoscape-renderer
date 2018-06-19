/**
 * Maintains state for dragging a node and hovering other nodes.
 */
export default class DragState {

  constructor (node) {
    this.node = node              // the dragged node
    this.nodePosition = {         // the dragged node's original position. Note: a new pos object must be created.
      x: node.position('x'),
      y: node.position('y')
    }
    this.hoverNode = undefined    // the node hovered while dragging
  }

  hover () {
    this.hoverNode.addClass('hover')
  }

  unhover () {
    this.hoverNode.removeClass('hover')
  }

  resetPosition () {
    this.node.animate({
      position: this.nodePosition,
      easing: 'ease-in-out-cubic',
      duration: 200
    })
  }

  dragged () {
    return this.nodePosition.x !== this.node.position('x') ||
           this.nodePosition.y !== this.node.position('y')
  }
}
