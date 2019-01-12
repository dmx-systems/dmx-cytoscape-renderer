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

let cy          // Cytoscape instance
let ec          // cytoscape-edge-connections API object
let faFont      // Font Awesome SVG <font> element
let fisheyeAnimation

let _selection  // the selection model for the rendered topicmap (a Selection object, defined in dm5-topicmaps),
                // initialized by renderTopicmap() method

// a promise resolved once the Font Awesome SVG is loaded
const svgReady = dm5.restClient.getXML(fa).then(svg => {
  // console.log('### SVG ready!')
  faFont = svg.querySelector('font')
})

// register extensions
cytoscape.use(require('cytoscape-cose-bilkent'))
cytoscape.use(require('cytoscape-cxtmenu'))
cytoscape.use(require('cytoscape-edgehandles'))
cytoscape.use(require('cytoscape-edge-connections'))

export default class CytoscapeView {

  constructor (parent, container, box, contextCommands, dispatch) {
    this.parent = parent,
    cy = this.instantiateCy(container)
    this.box = box              // the measurement box
    this.contextMenus(contextCommands)
    this.edgeHandles()
    ec = this.edgeConnections()
    this.dispatch = dispatch
    // Note: by using arrow functions in a select handler 'this' refers to this CytoscapeView instance (instead of the
    // clicked Cytoscape element). In standard ES6 class methods can't be defined in arrow notation. This would require
    // the stage-2 "class properties" feature. For some reason the Babel "transform-class-properties" plugin does not
    // work when the application is build by Jenkins CI.
    // The workaround is to define the select handlers in the constructor.
    // ### TODO: retry. Meanwhile we use GitLab CI/CD.
    this.onSelectNode   = this.nodeHandler('select')
    this.onSelectEdge   = this.edgeHandler('select')
    this.onUnselectNode = this.nodeHandler('unselect')
    this.onUnselectEdge = this.edgeHandler('unselect')
    this.eventHandlers()
  }

  // -------------------------------------------------------------------------------------------------------- Public API

  renderTopicmap (topicmap, selection) {
    _selection = selection
    return svgReady.then(() => {
      // Note: the cytoscape-amd extension expects an aux node still to exist at the time its edge is removed.
      // So we must remove the edges first.
      cy.remove('edge')
      cy.remove('node')
      cy.add(topicmap.filterTopics(viewTopic => viewTopic.isVisible()).map(cyNode))
      ec.addEdges(topicmap.mapAssocs(cyEdge))
      // console.log('### Topicmap rendering complete!')
    })
  }

  addTopic (viewTopic) {
    cy.add(cyNode(viewTopic))
  }

  addAssoc (viewAssoc) {
    ec.addEdge(cyEdge(viewAssoc))
  }

  remove (id) {
    cyElement(id).remove()
    // Note: the connected edges are removed automatically by Cytoscape
  }

  selectById (id) {
    return this.select(cyElement(id))
  }

  unselectById (id) {
    return this.unselect(cyElement(id))     // TODO: assert that cyElement() not empty?
  }

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

  // TODO: should we update per-field (like topic) or combined (like assoc)?

  updateTopicLabel (id, label) {
    cyElement(id).data('label', label)
  }

  updateTopicIcon (id, icon) {
    cyElement(id).data('icon', icon)
  }

  updateAssoc (id, data) {
    cyElement(id).data(data)
  }

  updateAssocColor (id, color) {
    cyElement(id).data('color', color)
  }

  /**
   * @return  a promise resolved once the animation is complete.
   */
  updateTopicPosition (id, pos) {
    return cyElement(id).animation({
      // duration: 3000,
      position: pos,
      easing: 'ease-in-out-cubic'
    }).play().promise()
  }

  playFisheyeAnimation() {
    // console.log('playFisheyeAnimation')
    fisheyeAnimation && fisheyeAnimation.stop()
    fisheyeAnimation = cy.layout({
      name: 'cose-bilkent',
      fit: false,
      /* animateFilter: (node, i) => {
        if (ec.isAuxNode(node)) {
          console.log(node.id(), ec.isAuxNode(node), node.position(), node.renderedPosition())
          // return false
        }
        return true // !ec.isAuxNode(node)
      }, */
      randomize: false,
      nodeRepulsion: 0,
      idealEdgeLength: 0,
      edgeElasticity: 0,
      tile: false
    }).run()
  }

  /**
   * Returns the detail node for the given DMX object.
   *
   * @param   id    a DMX object id (number)
   */
  detailNode (id) {
    const ele = cyElement(id)
    return ele.isNode() ? ele : ec.auxNode(ele)
  }

  resize () {
    cy.resize()
  }

  // TODO: make the following private if due ---------------------------------------------------------------------------

  nodeHandler (suffix) {
    // Note: a node might be an "auxiliary" node, that is a node that represents an edge.
    // In this case the original edge ID is contained in the node's "edgeId" data.
    return e => {
      const assocId = ec.edgeId(e.target)
      if (assocId) {
        if (suffix === 'select') {    // aux nodes don't emit assoc-unselect events
          this.parent.$emit('assoc-' + suffix, assocId)
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
    // In this case the original edge ID is contained in the node's "edgeId" data.
    cy.cxtmenu({
      selector: 'node',
      commands: ele => ec.isAuxNode(ele) ? assocCommands(ec.edgeId(ele)) : topicCommands(id(ele)),
      atMouse: true
    })
    cy.cxtmenu({
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
    cy.edgehandles({
      preview: false,
      handlePosition (node) {
        return !ec.isAuxNode(node) ? 'middle top' : 'middle middle'
      },
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

  // Edge Connections

  edgeConnections () {
    return cy.edgeConnections({
      edgeSelector: 'edge[color]',
      auxNodeData: edge => ({
        color: edge.data('color')
      })
    })
  }

  // Event Handling

  onSelectHandlers () {
    cy.on('select', 'node', this.onSelectNode)
      .on('select', 'edge', this.onSelectEdge)
  }

  offSelectHandlers () {
    cy.off('select', 'node', this.onSelectNode)
      .off('select', 'edge', this.onSelectEdge)
  }

  onUnselectHandlers () {
    cy.on('unselect', 'node', this.onUnselectNode)
      .on('unselect', 'edge', this.onUnselectEdge)
  }

  offUnselectHandlers () {
    cy.off('unselect', 'node', this.onUnselectNode)
      .off('unselect', 'edge', this.onUnselectEdge)
  }

  /**
   * Registers Cytoscape event handlers.
   */
  eventHandlers () {
    this.onSelectHandlers()
    this.onUnselectHandlers()
    cy.on('tap', 'node', e => {
      const clicks = e.originalEvent.detail
      // console.log('tap node', id(e.target), e.originalEvent, clicks)
      if (clicks === 2) {
        this.parent.$emit('topic-double-click', e.target.data('viewTopic'))
      }
    }).on('cxttap', e => {
      if (e.target === cy) {
        this.parent.$emit('topicmap-contextmenu', {
          model:  e.position,
          render: e.renderedPosition
        })
      }
    }).on('dragfreeon', e => {
      this.topicDrag(e.target)
    }).on('pan', () => {
      this.dispatch('_syncPan', cy.pan())
    }).on('zoom', () => {
      this.dispatch('_syncZoom', cy.zoom())
    }) /* .on('ready', () => {
      console.log('### Cytoscape ready')
    }) */
  }

  topicDrag (node) {
    if (!ec.isAuxNode(node)) {    // aux nodes don't emit topic-drag events
      if (this.isTopicSelected(id(node)) && this.isMultiSelection()) {
        // console.log('drag multi', _selection.topicIds)
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
    this.parent.$emit('topics-drag', _selection.topicIds.map(id => {
      const pos = cyElement(id).position()
      return {
        topicId: id,
        x: pos.x,
        y: pos.y
      }
    }))
  }

  // Helper

  invokeTopicHandler (id, cmd) {
    let arg
    if (cmd.multi) {
      arg = this.isTopicSelected(id) ? idLists() : {topicIds: [id], assocIds: []}
    } else {
      arg = id
    }
    cmd.handler(arg)
  }

  invokeAssocHandler (id, cmd) {
    let arg
    if (cmd.multi) {
      arg = this.isAssocSelected(id) ? idLists() : {topicIds: [], assocIds: [id]}
    } else {
      arg = id
    }
    cmd.handler(arg)
  }

  isTopicSelected (id) {
    return _selection.includesTopic(id)
  }

  isAssocSelected (id) {
    return _selection.includesAssoc(id)
  }

  isMultiSelection () {
    return _selection.isMulti()
  }
}

// ----------------------------------------------------------------------------------------------------- Private Methods

/**
 * Builds a Cytoscape node from a dm5.ViewTopic
 *
 * @param   viewTopic   A dm5.ViewTopic
 */
function cyNode (viewTopic) {
  return {
    data: {
      id:      viewTopic.id,
      label:   viewTopic.value,
      icon:    viewTopic.icon,
      viewTopic
    },
    position: viewTopic.getPosition()
  }
}

/**
 * Builds a Cytoscape edge from a dm5.ViewAssoc
 *
 * Prerequisite: viewAssoc has 2 topic players specified by-ID. ### FIXDOC (assoc players are supported as well)
 *
 * @param   viewAssoc   A dm5.ViewAssoc
 */
function cyEdge (viewAssoc) {
  return {
    data: {
      id:      viewAssoc.id,
      label:   viewAssoc.value,
      color:   viewAssoc.color,
      source:  viewAssoc.role1.id,
      target:  viewAssoc.role2.id,
      viewAssoc
    }
  }
}

function playerId (node) {
  const edgeId = ec.edgeId(node)
  return !edgeId ? {topicId: id(node)} : {assocId: edgeId}
}

// copy in dm5-detail-layer.vue
function id (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}

/**
 * Creates ID lists from the selection.
 * Note: the caller will pass the ID lists to a command handler. The ID lists are created by cloning in order
 * to allow the command handler to modify the selection without creating a side effect in the ID lists.
 */
function idLists () {
  return {
    topicIds: dm5.utils.clone(_selection.topicIds),
    assocIds: dm5.utils.clone(_selection.assocIds)
  }
}

/**
 * Gets the Cytoscape element with the given ID.
 *
 * @param   id    a DMX object id (number)
 *
 * @return  A collection of 1 or 0 elements. ### TODO: throw if 0?
 */
function cyElement (id) {
  return cy.getElementById(id.toString())     // Note: a Cytoscape element ID is a string
}
