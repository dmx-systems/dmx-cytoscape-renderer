<template>
  <div class="dm5-cytoscape-renderer">
    <div class="cytoscape-container" ref="cytoscape-container"></div>
    <div class="measurement-box" ref="measurement-box"></div>
    <dm5-detail-layer :object-renderers="objectRenderers" :quill-config="quillConfig" :zoom="zoom"
      @object-submit="submitObject" @child-topic-reveal="revealChildTopic">
    </dm5-detail-layer>
  </div>
</template>

<script>
export default {

  created () {
    // console.log('dm5-cytoscape-renderer created')
    this.$store.registerModule('cytoscapeRenderer', require('../cytoscape-renderer').default)
  },

  // Note: when the Cytoscape instance is created the DOM must be ready.
  mounted () {
    // console.log('dm5-cytoscape-renderer mounted')
    this.$store.dispatch('_initCytoscape', {
      container: this.$refs['cytoscape-container'],
      box:       this.$refs['measurement-box']
    })
    this.eventHandlers()
    this.contextMenus()
  },

  destroyed () {
    console.log('dm5-cytoscape-renderer destroyed!')
    this.$store.dispatch('_shutdownCytoscape')
  },

  mixins: [
    require('./mixins/object-renderers').default
  ],

  props: {
    contextCommands: Object,
    quillConfig: Object
  },

  data () {
    return {
      zoom: 1         // TODO: real init value
    }
  },

  computed: {
    cy () {
      return this.$store.state.cytoscapeRenderer.cy
    }
  },

  methods: {

    /**
     * Registers Cytoscape event handlers.
     */
    eventHandlers () {
      this.cy.on('tap', 'node', e => {
        const clicks = e.originalEvent.detail
        // console.log('"tap node" event!', id(e.target), clicks)
        if (clicks === 1) {
          this.$parent.$emit('topic-select', id(e.target))
        } else if (clicks === 2) {
          this.$parent.$emit('topic-double-click', id(e.target))
        }
      }).on('tap', 'edge', e => {
        // console.log('"tap edge" event!', id(e.target))
        this.$parent.$emit('assoc-select', id(e.target))
      }).on('tap', e => {
        if (e.target === this.cy) {
          // console.log('"tap background" event!')
          this.$parent.$emit('topicmap-click')
        }
      }).on('cxttap', e => {
        if (e.target === this.cy) {
          this.$parent.$emit('topicmap-contextmenu', {
            model:  e.position,
            render: e.renderedPosition
          })
        }
      }).on('tapstart', 'node', e => {
        const dragState = new DragState(e.target)
        const handler = this.dragHandler(dragState)
        this.cy.on('tapdrag', handler)
        this.cy.one('tapend', e => {
          this.cy.off('tapdrag', handler)
          if (dragState.hoverNode) {
            dragState.unhover()
            dragState.resetPosition()
            this.$parent.$emit('topic-drop-on-topic', {
              // topic 1 dropped onto topic 2
              topicId1: id(dragState.node),
              topicId2: id(dragState.hoverNode)
            })
          } else if (dragState.drag) {
            this.$parent.$emit('topic-drag', {
              id: id(dragState.node),
              pos: dragState.node.position()
            })
            this.$store.dispatch('_playFisheyeAnimation')  // TODO: play only if detail overlay
          }
        })
      }).on('zoom', () => {
        this.zoom = this.cy.zoom()
      })
    },

    contextMenus () {
      // Note: a node might be an "auxiliary" node, that is a node that represents an edge.
      // In this case the original edge ID is contained in the node's "assocId" data.
      this.cy.cxtmenu({
        selector: 'node',
        commands: ele => assocId(ele) ? assocCommands(assocId) : topicCommands(),
        atMouse: true
      })
      this.cy.cxtmenu({
        selector: 'edge',
        commands: ele => assocCommands(id)
      })

      const topicCommands = () => this.contextCommands.topic.map(cmd => ({
        content: cmd.label,
        select: ele => cmd.handler(id(ele))
      }))

      const assocCommands = idMapper => this.contextCommands.assoc.map(cmd => ({
        content: cmd.label,
        select: ele => cmd.handler(idMapper(ele))
      }))

      const assocId = ele => ele.data('assocId')
    },

    dragHandler (dragState) {
      return e => {
        var _node = this.nodeAt(e.position, dragState.node)
        if (_node) {
          if (_node !== dragState.hoverNode) {
            dragState.hoverNode && dragState.unhover()
            dragState.hoverNode = _node
            dragState.hover()
          }
        } else {
          if (dragState.hoverNode) {
            dragState.unhover()
            dragState.hoverNode = undefined
          }
        }
        dragState.drag = true
      }
    },

    nodeAt (pos, excludeNode) {
      var foundNode
      this.cy.nodes().forEach(node => {
        if (node !== excludeNode && isInside(pos, node)) {
          foundNode = node
          return false    // abort iteration
        }
      })
      return foundNode
    },

    submitObject (object) {
      this.$parent.$emit('object-submit', object)
    },

    revealChildTopic (relTopic) {
      this.$parent.$emit('child-topic-reveal', relTopic)
    }
  },

  components: {
    'dm5-detail-layer': require('./dm5-detail-layer').default
  }
}

/**
 * Maintains state for dragging a node and hovering other nodes.
 */
class DragState {

  constructor (node) {
    this.node = node              // the dragged node
    this.nodePosition = {         // the dragged node's original position. Note: a new pos object must be created.
      x: node.position('x'),
      y: node.position('y')
    }
    this.hoverNode = undefined    // the node hovered while dragging
    this.drag = false             // true once dragging starts
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
}

function isInside (pos, node) {
  var x = pos.x
  var y = pos.y
  var box = node.boundingBox()
  return x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2
}

// copy in cytoscape-renderer.js and dm5-detail-layer.vue
function id (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}
</script>

<style>
.dm5-cytoscape-renderer {
  height: 100%;
}

.dm5-cytoscape-renderer .cytoscape-container {
  height: 100%;
}

.dm5-cytoscape-renderer .measurement-box {
  position: absolute;
  visibility: hidden;
}
</style>
