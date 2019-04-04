import cytoscape from 'cytoscape'
import fa from 'font-awesome/fonts/fontawesome-webfont.svg'
import dm5 from 'dm5'

// get style from CSS variables
const style = window.getComputedStyle(document.body)
const FONT_FAMILY          = style.getPropertyValue('--main-font-family')
const MAIN_FONT_SIZE       = style.getPropertyValue('--main-font-size')
const LABEL_FONT_SIZE      = style.getPropertyValue('--label-font-size')
const ICON_COLOR           = style.getPropertyValue('--color-topic-icon')
const HIGHLIGHT_COLOR      = style.getPropertyValue('--highlight-color')
const BACKGROUND_COLOR     = style.getPropertyValue('--background-color')
const BORDER_COLOR_LIGHTER = style.getPropertyValue('--border-color-lighter')

const onSelectNode   = nodeHandler('select')
const onSelectEdge   = edgeHandler('select')
const onUnselectNode = nodeHandler('unselect')
const onUnselectEdge = edgeHandler('unselect')

// a promise resolved once the Font Awesome SVG is loaded
const svgReady = dm5.restClient.getXML(fa).then(svg => {
  // console.log('### SVG ready!')
  faFont = svg.querySelector('font')
})

let cy                  // Cytoscape instance
let ec                  // cytoscape-edge-connections API object
let parent              // the dm5-topicmap-panel (a Vue instance); used as event emitter
let box                 // the measurement box
let modifiers           // modifier keys
let dispatch
let faFont              // Font Awesome SVG <font> element
let fisheyeAnimation
let selection           // the selection model for the rendered topicmap (a Selection object, defined in dm5-topicmaps),
                        // initialized by renderTopicmap() method

cytoscape.warnings(false)

// register extensions
cytoscape.use(require('cytoscape-cose-bilkent'))
cytoscape.use(require('cytoscape-cxtmenu'))
cytoscape.use(require('cytoscape-edgehandles'))
cytoscape.use(require('cytoscape-edge-connections'))

export default class CytoscapeView {

  constructor (container, contextCommands, _parent, _box, _modifiers, _dispatch) {
    parent    = _parent,
    box       = _box
    modifiers = _modifiers
    dispatch  = _dispatch
    cy = instantiateCy(container)
    ec = cy.edgeConnections()
    contextMenus(contextCommands)
    edgeHandles()
    eventHandlers()
  }

  // -------------------------------------------------------------------------------------------------------- Public API

  renderTopicmap (topicmap, _selection) {
    selection = _selection
    return svgReady.then(() => {
      // Note: the cytoscape-edge-connections extension expects an aux node still to exist at the time its edge is
      // removed. So we must remove the edges first.
      cy.remove('edge')
      cy.remove('node')
      cy.viewport({
        pan: {
          x: topicmap.viewProps['dmx.topicmaps.pan_x'],
          y: topicmap.viewProps['dmx.topicmaps.pan_y']
        },
        zoom: topicmap.viewProps['dmx.topicmaps.zoom']
      })
      cy.add(     topicmap.topics.filter(topic => topic.isVisible()).map(cyNode))
      ec.addEdges(topicmap.assocs.filter(assoc => assoc.isVisible()).map(cyEdge))
      // console.log('### Topicmap rendering complete!')
    })
  }

  addTopic (viewTopic) {
    cy.add(cyNode(viewTopic))
  }

  addAssoc (viewAssoc) {
    ec.addEdge(cyEdge(viewAssoc))
  }

  /**
   * Removes an element from the graph.
   */
  remove (id) {
    cyElement(id).remove()
    // Note: when removing a node Cytoscape removes the connected edges automatically
  }

  selectById (id) {
    return this.select(cyElement(id))
  }

  unselectById (id) {
    return this.unselect(cyElement(id))     // FIXME: might cyElement() fail?
  }

  /**
   * Selects a Cytoscape element programmatically *without* emitting a (Cytoscape) `select` event.
   */
  select (ele) {
    offSelectHandlers()
    ele.select()
    onSelectHandlers()
    return ele
  }

  /**
   * Unselects a Cytoscape element programmatically *without* emitting a (Cytoscape) `unselect` event.
   */
  unselect (ele) {
    offUnselectHandlers()
    ele.unselect()
    onUnselectHandlers()
    return ele
  }

  updateTopic (id, data) {
    cyElement(id).data(data)
  }

  updateAssoc (id, data) {
    cyElement(id).data(data)
  }

  /**
   * @return  a promise resolved once the animation is complete.
   */
  updateTopicPos (id, pos) {
    return cyElement(id).animation({
      // duration: 3000,
      position: pos,
      easing: 'ease-in-out-cubic'
    }).play().promise()
  }

  playFisheyeAnimation() {
    playFisheyeAnimation()
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
}

// ----------------------------------------------------------------------------------------------------- Private Methods

// Cytoscape Instantiation

function instantiateCy (container) {
  return cytoscape({
    container,
    style: [
      {
        selector: 'node[icon]',
        style: {
          'shape': 'rectangle',
          'background-image': ele => renderNode(ele).url,
          'background-opacity': 0,
          'width':  ele => renderNode(ele).width,
          'height': ele => renderNode(ele).height,
          'border-width': 1,
          'border-color': BORDER_COLOR_LIGHTER,
          'border-opacity': 1
        }
      },
      {
        selector: 'node.aux-node',
        style: {
          'width': 6,
          'height': 6
        }
      },
      {
        selector: 'node.eh-handle',
        style: {
          'background-color': HIGHLIGHT_COLOR,
          'width': 12,
          'height': 12
        }
      },
      {
        selector: 'node.eh-source, node.eh-target',
        style: {
          'border-width': 2,
          'border-color': HIGHLIGHT_COLOR,
          'border-opacity': 1
        }
      },
      {
        selector: 'edge[color]',
        style: {
          'width': 3,
          'line-color': 'data(color)',
          'curve-style': 'bezier',
          // See label positioning trick: https://github.com/cytoscape/cytoscape.js/issues/2329
          'label': ele => ele.data('label') + '\n\n\u2060',
          'font-family': FONT_FAMILY,
          'font-size': LABEL_FONT_SIZE,
          'text-rotation': 'autorotate',
          'text-wrap': 'wrap'
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
function renderNode (ele) {
  const label = ele.data('label')
  const iconPath = faGlyphPath(ele.data('icon'))
  const size = measureText(label)
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

function faGlyphPath (unicode) {
  try {
    return faFont.querySelector(`glyph[unicode="${unicode}"]`).getAttribute('d')
  } catch (e) {
    throw Error(`Font Awesome glyph "${unicode}" not available (${e})`)
  }
}

function measureText (text) {
  box.textContent = text
  return {
    width: box.clientWidth,
    height: box.clientHeight
  }
}

// Context Menus

const FUN = {
  topic: {handlerArg: topicHandlerArg, isSelected: isTopicSelected},
  assoc: {handlerArg: assocHandlerArg, isSelected: isAssocSelected}
}

/**
 * Creates the topic/assoc context menus.
 */
function contextMenus (contextCommands) {
  // Note 1: no context menu (undefined) for "edge handle" nodes
  // Note 2: for (expanded) "aux nodes" show the *assoc* context menu
  cy.cxtmenu({
    selector: 'node',
    commands: ele => {
      if (isEdgeHandle(ele)) {
        return
      }
      return ec.isAuxNode(ele) ? commands('assoc', edgeId(ele)) : commands('topic', id(ele))
    },
    atMouse: true
  })
  cy.cxtmenu({
    selector: 'edge',
    commands: ele => commands('assoc', id(ele))
  })

  function commands (kind, id) {
    const danger = modifiers.alt
    // map DMX command defs to Cytoscape commands;
    // the "commands" array will contain commands and/or command promises
    const commands = contextCommands[kind + (danger ? '_danger' : '')].map(cmd => {
      const arg = FUN[kind].handlerArg(id, cmd)
      const command = {
        content: cmd.label,
        select: ele => cmd.handler(arg),
        // disable command in face of a multi selection when the command does not support multi
        disabled: !cmd.multi && FUN[kind].isSelected(id) && isMultiSelection(),
        ...danger ? {fillColor: 'rgba(200, 0, 0, 0.75)'} : undefined
      }
      // a command can be also disabled by a user-defined "disabled" callback;
      // the "disabled" callback is expected to return a boolean or a boolean promise
      if (!command.disabled && cmd.disabled) {
        const disabled = cmd.disabled(arg)
        if (disabled instanceof Promise) {
          return disabled.then(disabled => {
            command.disabled = disabled
            return command
          })
        } else {
          command.disabled = disabled
        }
      }
      return command
    })
    return Promise.all(commands)
  }
}

function topicHandlerArg (id, cmd) {
  if (cmd.multi) {
    return isTopicSelected(id) ? idLists() : {topicIds: [id], assocIds: []}
  } else {
    return id
  }
}

function assocHandlerArg (id, cmd) {
  if (cmd.multi) {
    return isAssocSelected(id) ? idLists() : {topicIds: [], assocIds: [id]}
  } else {
    return id
  }
}

/**
 * Creates ID lists from the selection.
 * Note: the caller will pass the ID lists to a command handler. The ID lists are created by cloning in order
 * to allow the command handler to modify the selection without creating a side effect in the ID lists.
 */
function idLists () {
  return {
    topicIds: dm5.utils.clone(selection.topicIds),
    assocIds: dm5.utils.clone(selection.assocIds)
  }
}

// Edge Handles

function edgeHandles () {
  cy.edgehandles({
    preview: false,
    handlePosition (node) {
      return !ec.isAuxNode(node) ? 'middle top' : 'middle middle'
    },
    complete: (sourceNode, targetNode, addedEles) => {
      // console.log('complete', sourceNode, targetNode, addedEles)
      emitAssocCreate(sourceNode, targetNode)
      addedEles.remove()
    }
  })
}

function emitAssocCreate (sourceNode, targetNode) {
  parent.$emit('assoc-create', {
    playerId1: playerId(sourceNode),
    playerId2: playerId(targetNode)
  })
}

function isEdgeHandle (ele) {
  return ele.hasClass('eh-handle')
}

// Event Handling

function onSelectHandlers () {
  cy.on('select', 'node', onSelectNode)
    .on('select', 'edge', onSelectEdge)
}

function offSelectHandlers () {
  cy.off('select', 'node', onSelectNode)
    .off('select', 'edge', onSelectEdge)
}

function onUnselectHandlers () {
  cy.on('unselect', 'node', onUnselectNode)
    .on('unselect', 'edge', onUnselectEdge)
}

function offUnselectHandlers () {
  cy.off('unselect', 'node', onUnselectNode)
    .off('unselect', 'edge', onUnselectEdge)
}

function nodeHandler (suffix) {
  // Note: a node might be an "auxiliary" node, that is a node that represents an edge.
  // In this case the original edge ID is contained in the node's "edgeId" data.
  return e => {
    const assocId = edgeId(e.target)
    if (assocId) {
      if (suffix === 'select') {    // aux nodes don't emit assoc-unselect events
        parent.$emit('assoc-' + suffix, assocId)
      }
    } else {
      parent.$emit('topic-' + suffix, id(e.target))
    }
  }
}

function edgeHandler (suffix) {
  return e => {
    parent.$emit('assoc-' + suffix, id(e.target))
  }
}

/**
 * Registers Cytoscape event handlers.
 */
function eventHandlers () {
  onSelectHandlers()
  onUnselectHandlers()
  cy.on('tap', 'node', e => {
    const clicks = e.originalEvent.detail
    // console.log('tap node', id(e.target), e.originalEvent, clicks)
    if (clicks === 2) {
      parent.$emit('topic-double-click', e.target.data('viewTopic'))
    }
  }).on('cxttap', e => {
    if (e.target === cy) {
      parent.$emit('topicmap-contextmenu', {
        model:  e.position,
        render: e.renderedPosition
      })
    }
  }).on('dragfreeon', e => {
    topicDrag(e.target)
  }).on('viewport', () => {
    dispatch('_syncViewport', {
      pan: cy.pan(),
      zoom: cy.zoom()
    })
  })
}

function topicDrag (node) {
  if (!ec.isAuxNode(node)) {    // aux nodes don't emit topic-drag events
    if (isTopicSelected(id(node)) && isMultiSelection()) {
      // console.log('drag multi', selection.topicIds)
      emitTopicsDrag()
    } else {
      // console.log('drag single', id(node))
      emitTopicDrag(node)
    }
  }
  playFisheyeAnimation()        // TODO: play only if details are visible
}

function emitTopicDrag (node) {
  parent.$emit('topic-drag', {
    id: id(node),
    pos: node.position()
  })
}

function emitTopicsDrag (node) {
  parent.$emit('topics-drag', selection.topicIds.map(id => {
    const pos = cyElement(id).position()
    return {
      topicId: id,
      x: pos.x,
      y: pos.y
    }
  }))
}

// Animation

function playFisheyeAnimation() {
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

// Helper

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

// ---

function isTopicSelected (id) {
  return selection.includesTopic(id)
}

function isAssocSelected (id) {
  return selection.includesAssoc(id)
}

function isMultiSelection () {
  return selection.isMulti()
}

// ---

function playerId (node) {
  const _edgeId = edgeId(node)
  return !_edgeId ? {topicId: id(node)} : {assocId: _edgeId}
}

function edgeId (node) {
  return Number(ec.edgeId(node))
}

// copy in dm5-detail-layer.vue
function id (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}

/**
 * Returns the Cytoscape element with the given ID.
 *
 * @param   id      a DMX object id (number)
 *
 * @throws  Error   if there is no such element in the graph
 *
 * @return  the element (1-element Cytoscape collection)
 */
function cyElement (id) {
  const ele = _cyElement(id)
  if (ele.empty()) {
    throw Error(`element ${id} not in graph`)
  }
  return ele
}

/**
 * @return  a Cytoscape collection containing 1 or 0 elements
 */
function _cyElement (id) {
  return cy.getElementById(id.toString())     // Note: a Cytoscape element ID is a string
}
