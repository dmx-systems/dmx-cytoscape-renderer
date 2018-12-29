import cytoscape from 'cytoscape'
import fa from 'font-awesome/fonts/fontawesome-webfont.svg'
import dm5 from 'dm5'

// get style from CSS variables
const style = window.getComputedStyle(document.body)
const FONT_FAMILY          = style.getPropertyValue('--main-font-family')
const MAIN_FONT_SIZE       = style.getPropertyValue('--main-font-size')
const LABEL_FONT_SIZE      = style.getPropertyValue('--label-font-size')
const ICON_COLOR           = style.getPropertyValue('--color-topic-icon')
const HOVER_BORDER_COLOR   = style.getPropertyValue('--color-topic-hover')
const HIGHLIGHT_COLOR      = style.getPropertyValue('--highlight-color')
const BACKGROUND_COLOR     = style.getPropertyValue('--background-color')
const BORDER_COLOR_LIGHTER = style.getPropertyValue('--border-color-lighter')

var faFont      // Font Awesome SVG <font> element

const svgReady = dm5.restClient.getXML(fa).then(svg => {
  // console.log('### SVG ready!')
  faFont = svg.querySelector('font')
})

// register extensions
cytoscape.use(require('cytoscape-cose-bilkent'))
cytoscape.use(require('cytoscape-cxtmenu'))
cytoscape.use(require('cytoscape-edgehandles'))
cytoscape.use(require('./cytoscape-amd').default)   // ES6 default export

export default class CytoscapeView {

  constructor (parent, container, box, contextCommands, state, dispatch) {
    this.parent = parent,
    this.cy = this.instantiateCy(container)
    this.box = box              // the measurement box
    this.contextMenus(contextCommands)
    this.edgeHandles()
    this.state = state
    this.dispatch = dispatch
    this.svgReady = svgReady    // a promise resolved once the Font Awesome SVG is loaded
    // Note: by using arrow functions in a select handler 'this' refers to this CytoscapeView instance (instead of the
    // clicked Cytoscape element). In standard ES6 class methods can't be defined in arrow notation. This would require
    // the stage-2 "class properties" feature. For some reason the Babel "transform-class-properties" plugin does not
    // work when the application is build by Jenkins CI.
    // The solution is to define the select handlers in the constructor.
    this.onSelectNode   = this.nodeHandler('select')
    this.onSelectEdge   = this.edgeHandler('select')
    this.onUnselectNode = this.nodeHandler('unselect')
    this.onUnselectEdge = this.edgeHandler('unselect')
    this.eventHandlers()
  }

  nodeHandler (suffix) {
    // Note: a node might be an "auxiliary" node, that is a node that represents an edge.
    // In this case the original edge ID is contained in the node's "assocId" data.
    return e => {
      const _assocId = assocId(e.target)
      if (_assocId) {
        if (suffix === 'select') {    // aux nodes don't emit assoc-unselect events
          this.parent.$emit('assoc-' + suffix, _assocId)
        }
      } else {
        this.parent.$emit('topic-' + suffix, id(e.target))
      }
    }
  }

  edgeHandler (suffix) {
    return e => {
      this.parent.$emit('assoc-' + suffix, id(e.target))
    }
  }

  // Cytoscape Instantiation

  instantiateCy (container) {
    return cytoscape({
      container,
      style: [
        {
          selector: 'node[icon]',
          style: {
            'shape': 'rectangle',
            'background-image': ele => this.renderNode(ele).url,
            'background-opacity': 0,
            'width':  ele => this.renderNode(ele).width,
            'height': ele => this.renderNode(ele).height,
            'border-width': 1,
            'border-color': BORDER_COLOR_LIGHTER,
            'border-opacity': 1
          }
        },
        {
          selector: 'node[color]',
          style: {
            'shape': 'ellipse',
            'background-color': 'data(color)',
            'width': 6,
            'height': 6,
          }
        },
        {
          selector: 'node.eh-handle',
          style: {
            'width': 12,
            'height': 12
          }
        },
        {
          selector: 'edge[color]',
          style: {
            'width': 3,
            'line-color': 'data(color)',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-family': FONT_FAMILY,
            'font-size': LABEL_FONT_SIZE,
            'text-margin-y': '-10',
            'text-rotation': 'autorotate'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': HIGHLIGHT_COLOR
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 6
          }
        },
        {
          selector: 'node.expanded',
          style: {
            'border-opacity': 0
          }
        },
        {
          selector: 'node.eh-source, node.eh-target',
          style: {
            'border-width': 3,
            'border-color': HOVER_BORDER_COLOR,
            'border-opacity': 1
          }
        }
      ],
      layout: {
        name: 'preset'
      },
      wheelSensitivity: 0.2
    })
  }

  // ### TODO: copy in topic-model.js
  cyElement (id) {
    return this.cy.getElementById(id.toString())
  }

  // Node Rendering

  // TODO: memoization
  renderNode (ele) {
    const label = ele.data('label')
    const iconPath = this.faGlyphPath(ele.data('icon'))
    const size = this.measureText(label)
    const width = size.width + 32
    const height = size.height + 8
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="${BACKGROUND_COLOR}"></rect>
        <text x="26" y="${height - 7}" font-family="${FONT_FAMILY}" font-size="${MAIN_FONT_SIZE}">${label}</text>
        <path d="${iconPath}" fill="${ICON_COLOR}" transform="scale(0.009 -0.009) translate(600 -2000)"></path>
      </svg>`
    return {
      url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      width, height
    }
  }

  faGlyphPath (unicode) {
    try {
      return faFont.querySelector(`glyph[unicode="${unicode}"]`).getAttribute('d')
    } catch (e) {
      throw Error(`Font Awesome glyph "${unicode}" not available (${e})`)
    }
  }

  measureText (text) {
    this.box.textContent = text
    return {
      width: this.box.clientWidth,
      height: this.box.clientHeight
    }
  }

  // Context Menus

  /**
   * Creates both the topic context menu and the assoc context menu.
   */
  contextMenus (contextCommands) {
    // Note: a node might be an "auxiliary" node, that is a node that represents an edge.
    // In this case the original edge ID is contained in the node's "assocId" data.
    this.cy.cxtmenu({
      selector: 'node',
      commands: ele => assocId(ele) ? assocCommands(assocId(ele)) : topicCommands(id(ele)),
      atMouse: true
    })
    this.cy.cxtmenu({
      selector: 'edge',
      commands: ele => assocCommands(id(ele))
    })

    const topicCommands = id => contextCommands.topic.map(cmd => ({
      content: cmd.label,
      select: ele => this.invokeTopicHandler(id, cmd),
      disabled: !cmd.multi && this.isTopicSelected(id) && this.isMultiSelection()
    }))

    const assocCommands = id => contextCommands.assoc.map(cmd => ({
      content: cmd.label,
      select: ele => this.invokeAssocHandler(id, cmd),
      disabled: !cmd.multi && this.isAssocSelected(id) && this.isMultiSelection()
    }))
  }

  // Edge Handles

  edgeHandles () {
    this.cy.edgehandles({
      preview: false,
      complete: (sourceNode, targetNode, addedEles) => {
        // console.log('complete', sourceNode, targetNode, addedEles)
        this.emitAssocCreate(sourceNode, targetNode)
        addedEles.remove()
      }
    })
  }

  emitAssocCreate (sourceNode, targetNode) {
    this.parent.$emit('assoc-create', {
      playerId1: playerId(sourceNode),
      playerId2: playerId(targetNode)
    })
  }

  // Event Handling

  onSelectHandlers () {
    this.cy
      .on('select', 'node', this.onSelectNode)
      .on('select', 'edge', this.onSelectEdge)
  }

  offSelectHandlers () {
    this.cy
      .off('select', 'node', this.onSelectNode)
      .off('select', 'edge', this.onSelectEdge)
  }

  onUnselectHandlers () {
    this.cy
      .on('unselect', 'node', this.onUnselectNode)
      .on('unselect', 'edge', this.onUnselectEdge)
  }

  offUnselectHandlers () {
    this.cy
      .off('unselect', 'node', this.onUnselectNode)
      .off('unselect', 'edge', this.onUnselectEdge)
  }

  /**
   * Registers Cytoscape event handlers.
   */
  eventHandlers () {
    this.onSelectHandlers()
    this.onUnselectHandlers()
    this.cy.on('tap', 'node', e => {
      const clicks = e.originalEvent.detail
      // console.log('tap node', id(e.target), e.originalEvent, clicks)
      if (clicks === 2) {
        this.parent.$emit('topic-double-click', e.target.data('viewTopic'))
      }
    }).on('cxttap', e => {
      if (e.target === this.cy) {
        this.parent.$emit('topicmap-contextmenu', {
          model:  e.position,
          render: e.renderedPosition
        })
      }
    }).on('dragfreeon', e => {
      this.topicDrag(e.target)
    }).on('pan', () => {
      this.dispatch('_syncPan', this.cy.pan())
    }).on('zoom', () => {
      this.dispatch('_syncZoom', this.cy.zoom())
    })
  }

  topicDrag (node) {
    if (!assocId(node)) {   // aux nodes don't emit topic-drag events
      if (this.isTopicSelected(id(node)) && this.isMultiSelection()) {
        // console.log('drag multi', this.state.selection.topicIds)
        this.emitTopicsDrag()
      } else {
        // console.log('drag single', id(node))
        this.emitTopicDrag(node)
      }
    }
    this.dispatch('_playFisheyeAnimation')    // TODO: play only if details are visible
  }

  emitTopicDrag (node) {
    this.parent.$emit('topic-drag', {
      id: id(node),
      pos: node.position()
    })
  }

  emitTopicsDrag (node) {
    this.parent.$emit('topics-drag', this.state.selection.topicIds.map(id => {
      const pos = this.cyElement(id).position()
      return {
        topicId: id,
        x: pos.x,
        y: pos.y
      }
    }))
  }

  // View Synchronization

  /**
   * Programmatically selects a Cytoscape element *without* emitting a (Cytoscape) `select` event.
   */
  select (ele) {
    this.offSelectHandlers()
    ele.select()
    this.onSelectHandlers()
    return ele
  }

  /**
   * Programmatically unselects a Cytoscape element *without* emitting a (Cytoscape) `unselect` event.
   */
  unselect (ele) {
    this.offUnselectHandlers()
    ele.unselect()
    this.onUnselectHandlers()
    return ele
  }

  // Helper

  invokeTopicHandler (id, cmd) {
    var arg
    if (cmd.multi) {
      arg = this.isTopicSelected(id) ? idLists(this.state.selection) : {topicIds: [id], assocIds: []}
    } else {
      arg = id
    }
    cmd.handler(arg)
  }

  invokeAssocHandler (id, cmd) {
    var arg
    if (cmd.multi) {
      arg = this.isAssocSelected(id) ? idLists(this.state.selection) : {topicIds: [], assocIds: [id]}
    } else {
      arg = id
    }
    cmd.handler(arg)
  }

  isTopicSelected (id) {
    return this.state.selection.includesTopic(id)
  }

  isAssocSelected (id) {
    return this.state.selection.includesAssoc(id)
  }

  isMultiSelection () {
    return this.state.selection.isMulti()
  }
}

function playerId (node) {
  const edgeId = node.edgeId()
  return !edgeId ? {topicId: id(node)} : {assocId: edgeId}
}

// copy in dm5-detail-layer.vue
function id (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}

// ID mapper for aux nodes ### TODO: drop it; use ele.edgeId() instead
function assocId (ele) {
  return ele.data('assocId')
}

/**
 * Creates ID lists from a selection.
 * Note: the caller will pass the ID lists to a command handler. The ID lists are created by cloning in order
 * to allow the command handler to modify the selection without creating a side effect in the ID lists.
 */
function idLists (selection) {
  return {
    topicIds: dm5.utils.clone(selection.topicIds),
    assocIds: dm5.utils.clone(selection.assocIds)
  }
}
