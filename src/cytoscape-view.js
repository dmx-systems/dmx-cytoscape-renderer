import cytoscape from 'cytoscape'
import fa from 'font-awesome/fonts/fontawesome-webfont.svg'
import dm5 from 'dm5'

// get style from CSS variables
const style = window.getComputedStyle(document.body)
const FONT_FAMILY          = style.getPropertyValue('--main-font-family')
const MAIN_FONT_SIZE       = style.getPropertyValue('--main-font-size')
const LABEL_FONT_SIZE      = style.getPropertyValue('--label-font-size')
const HIGHLIGHT_COLOR      = style.getPropertyValue('--highlight-color')
const BORDER_COLOR_LIGHTER = style.getPropertyValue('--border-color-lighter')

const PAN_PADDING = 50
const PAN_PADDING_TOP = 82

const MAX_LABEL_LENGTH = 80

const onSelectNode   = nodeHandler('select')
const onSelectEdge   = edgeHandler('select')
const onUnselectNode = nodeHandler('unselect')
const onUnselectEdge = edgeHandler('unselect')

// a promise resolved once the Font Awesome SVG is loaded
const svgReady = dm5.restClient.getXML(fa).then(svg => {
  // console.log('### SVG ready!')
  faFont = svg.querySelector('font')
  faDefaultWidth = faFont.getAttribute('horiz-adv-x')
})

let cy                  // Cytoscape instance
let ec                  // cytoscape-edge-connections API object
let eh                  // cytoscape-edgehandles API object
let parent              // the dm5-topicmap-panel (a Vue instance); used as event emitter
let box                 // the measurement box
let modifiers           // modifier keys
let dispatch
let faFont              // Font Awesome SVG <font> element
let faDefaultWidth      // Default icon width
let fisheyeAnimation
let selection           // the selection model for the rendered topicmap (a Selection object, defined in dm5-topicmaps),
                        // initialized by renderTopicmap() method

cytoscape.warnings(false)

// register extensions
cytoscape.use(require('cytoscape-autopan-on-drag'))
// cytoscape.use(require('cytoscape-cose-bilkent'))   // layout is currently switched off; see AUTO_LAYOUT in
cytoscape.use(require('cytoscape-cxtmenu'))           //                                   topicmap-model.js
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
    eh = edgeHandles()
    cy.autopanOnDrag()
    contextMenus(contextCommands)
    eventHandlers()
  }

  // -------------------------------------------------------------------------------------------------------- Public API

  renderTopicmap (topicmap, writable, _selection) {
    writable ? eh.enable() : eh.disable()
    selection = _selection
    return svgReady.then(() => {
      // console.log('renderTopicmap', topicmap.id)
      // console.time('renderTopicmap')
      // Note 1: utilization of cy.batch() would have a detrimental effect on calculating aux node positions of parallel
      // edges. This is because aux node positions of parallel edges are calculated several times.
      // Note 2: the cytoscape-edge-connections extension expects an aux node still to exist at the time its edge is
      // removed. So we must remove the edges first.
      cy.remove('edge')
      cy.remove('node')
      cy.add(     topicmap.topics.filter(topic => topic.isVisible()).map(cyNode))
      ec.addEdges(topicmap.assocs.filter(assoc => assoc.isVisible()).map(cyEdge))
      setViewport({
        x: topicmap.viewProps['dmx.topicmaps.pan_x'],
        y: topicmap.viewProps['dmx.topicmaps.pan_y']
      }, topicmap.viewProps['dmx.topicmaps.zoom'])
      // console.timeEnd('renderTopicmap')
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
   * If the element is not in the graph, nothing is performed.
   */
  remove (id) {
    _cyElement(id).remove()
    // Note: when removing a node Cytoscape removes the connected edges automatically.
    // Note: idempotence is needed for hide-multi.
  }

  selectById (id) {
    return this.select(cyElement(id))
  }

  unselectById (id) {
    return this.unselect(cyElement(id))
  }

  /**
   * Selects an element programmatically *without* emitting a (Cytoscape) `select` event.
   */
  select (ele) {
    unregisterSelectHandlers()
    ele.select()
    registerSelectHandlers()
    return ele
  }

  /**
   * Unselects an element programmatically *without* emitting a (Cytoscape) `unselect` event.
   */
  unselect (ele) {
    unregisterUnselectHandlers()
    ele.unselect()
    registerUnselectHandlers()
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

  /**
   * @param   callback  called once animation is complete
   */
  playFisheyeAnimation (callback) {
    playFisheyeAnimation(callback)
  }

  autoPanById (id) {
    return this.autoPan(cyElement(id))
  }

  autoPan (node) {
    const w = cy.width()
    const h = cy.height()
    // console.log('autoPan', id(node), w, h)
    const {x1, y1, x2, y2} = node.renderedBoundingBox()
    let x, y
    if (x1 < 0) {
      // console.log('left', -x1)
      x = -x1 + PAN_PADDING
    } else if (x2 > w) {
      // console.log('right', w - x2)
      x = w - x2 - PAN_PADDING
    }
    if (y1 < 0) {
      // console.log('top', -y1)
      y = -y1 + PAN_PADDING_TOP
    } else if (y2 > h) {
      // console.log('bottom', h - y2)
      y = h - y2 - PAN_PADDING
    }
    if (x || y) {
      cy.animate({
        panBy: {x, y},
        easing: 'ease-in-out-cubic'
      })
    }
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

  fit () {
    cy.animate({
      fit: {padding: 10},
      easing: 'ease-in-out-cubic'
    })
  }

  reset () {
    cy.animate({
      zoom: 1,
      center: {},
      easing: 'ease-in-out-cubic'
    })
  }

  resize () {
    cy.resize()
  }

  hideEdgeHandle () {
    eh.hide()
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
        selector: 'node.aux-node.expanded',
        style: {
          'shape': 'rectangle',
          'background-opacity': 0
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

const memoCache = {}

function renderNode (ele) {
  const label = nodeLabel(ele.data('label'))
  const icon = ele.data('icon')
  const iconColor = ele.data('iconColor')
  const backgroundColor = ele.data('backgroundColor')
  const memoKey = `${label}-${icon}-${iconColor}-${backgroundColor}`
  let r = memoCache[memoKey]
  if (!r) {
    r = _renderNode(label, icon, iconColor, backgroundColor)
    memoCache[memoKey] = r
  }
  return r
}

function _renderNode (label, icon, iconColor, backgroundColor) {
  const glyph = faGlyph(icon)
  const iconWidth = 0.009 * glyph.width
  const size = measureText(label)
  const width = size.width + iconWidth + 18
  const height = size.height + 8
  const x = iconWidth + 12
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}"></rect>
      <text x="${x}" y="${height - 7}" font-family="${FONT_FAMILY}" font-size="${MAIN_FONT_SIZE}">${label}</text>
      <path d="${glyph.path}" fill="${iconColor}" transform="scale(0.009 -0.009) translate(600 -2080)"></path>
    </svg>`
  return {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    width, height
  }
}

function nodeLabel (label) {
  label = label.length > MAX_LABEL_LENGTH ? label.substr(0, MAX_LABEL_LENGTH) + '…' : label
  label = label.replace(/&/g, '&amp;').replace(/</g, '&lt;')    // TODO: move to utils?
  return label
}

function faGlyph (unicode) {
  try {
    const glyph = faFont.querySelector(`glyph[unicode="${unicode}"]`)
    return {
      path: glyph.getAttribute('d'),
      width: glyph.getAttribute('horiz-adv-x') || faDefaultWidth
    }
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
  topic: {handlerArg: topicHandlerArg, isSelected: isTopicSelected, view: 'viewTopic'},
  assoc: {handlerArg: assocHandlerArg, isSelected: isAssocSelected, view: 'viewAssoc'}
}

/**
 * Creates the topic/assoc context menus.
 */
function contextMenus (contextCommands) {
  // Note 1: no context menu (undefined) for "edge handle" nodes
  // Note 2: for (expanded) "aux nodes" show the *assoc* context menu
  cy.cxtmenu({
    selector: 'node',
    commands: ele =>
      isEdgeHandle(ele) ? [] :
      isAuxNode(ele) ? commands('assoc', edgeId(ele)) :
                       commands('topic', id(ele)),
    atMouse: true
  })
  cy.cxtmenu({
    selector: 'edge',
    commands: ele => commands('assoc', id(ele))
  })

  function commands (kind, id) {
    // any modifier key will invoke "danger zone" menu
    const danger = modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift
    // map DMX command defs to Cytoscape commands;
    // the "commands" array will contain commands and/or command promises
    const commands = contextCommands[kind + (danger ? '_danger' : '')]
    .flatMap(cmd => typeof cmd === 'function' ? cmd(cyElement(id).data(FUN[kind].view)) || [] : cmd)
    .map(cmd => {
      const arg = FUN[kind].handlerArg(id, cmd)
      const command = {
        content: cmd.label,
        select: ele => cmd.handler(arg),
        // disable command in face of a multi selection when the command does not support multi
        disabled: !cmd.multi && FUN[kind].isSelected(id) && isMultiSelection()
      }
      if (cmd.multi) {
        const _size = size(arg)
        if (_size > 1) {
          command.content += ` ${_size} items`
        }
      }
      // a command can also be disabled by a user-defined "disabled" callback;
      // the "disabled" callback is expected to return a boolean or a boolean promise
      if (!command.disabled && cmd.disabled) {
        const disabled = cmd.disabled(arg)
        if (disabled instanceof Promise) {      // TODO: async/await will remove code doubling
          return disabled.then(disabled => {
            command.disabled = disabled
            setColor(command, danger)
            return command
          })
        } else {
          command.disabled = disabled
        }
      }
      setColor(command, danger)
      return command
    })
    return Promise.all(commands)
  }

  function setColor(command, danger) {
    if (command.disabled) {
      if (danger) {
        command.fillColor = 'rgba(200, 80, 80, 0.75)'
        command.contentStyle = {color: 'hsl(0, 50%, 80%)'}
      } else {
        command.fillColor = 'rgba(100, 100, 100, 0.75)'
        command.contentStyle = {color: 'hsl(0, 0%, 70%)'}
      }
    } else if (danger) {
      command.fillColor = 'rgba(200, 0, 0, 0.75)'
    }
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

// copy in webclient.js (module dmx-webclient)
// TODO: unify selection models (see selection.js in dmx-topicmaps module)
function size (idLists) {
  return idLists.topicIds.length + idLists.assocIds.length
}

// Edge Handles

function edgeHandles () {
  return cy.edgehandles({
    preview: false,
    handlePosition (node) {
      return !isAuxNode(node) ? 'middle top' : 'middle middle'
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

function registerSelectHandlers () {
  cy.on('select', 'node', onSelectNode)
    .on('select', 'edge', onSelectEdge)
}

function unregisterSelectHandlers () {
  cy.off('select', 'node', onSelectNode)
    .off('select', 'edge', onSelectEdge)
}

function registerUnselectHandlers () {
  cy.on('unselect', 'node', onUnselectNode)
    .on('unselect', 'edge', onUnselectEdge)
}

function unregisterUnselectHandlers () {
  cy.off('unselect', 'node', onUnselectNode)
    .off('unselect', 'edge', onUnselectEdge)
}

/**
 * @param   suffix    'select' or 'unselect'
 */
function nodeHandler (suffix) {
  return e => {
    const assocId = edgeId(e.target)
    if (assocId) {
      parent.$emit('assoc-' + suffix, assocId)
    } else {
      parent.$emit('topic-' + suffix, id(e.target))
    }
  }
}

/**
 * @param   suffix    'select' or 'unselect'
 */
function edgeHandler (suffix) {
  return e => {
    parent.$emit('assoc-' + suffix, id(e.target))
  }
}

/**
 * Registers Cytoscape event handlers.
 */
function eventHandlers () {
  registerSelectHandlers()
  registerUnselectHandlers()
  cy.on('tap', 'node', e => {
    const clicks = e.originalEvent.detail
    // console.log('tap node', id(e.target), e.originalEvent, clicks)
    if (clicks === 2) {
      parent.$emit('topic-double-click', e.target.data('viewTopic'))
    }
  }).on('cxttap taphold', e => {
    if (e.target === cy) {
      parent.$emit('topicmap-contextmenu', {
        model:  e.position,
        render: e.renderedPosition
      })
    }
  }).on('dragfreeon', e => {
    topicDrag(e.target)
  })
}

function topicDrag (node) {
  if (!isAuxNode(node)) {    // aux nodes don't emit topic-drag events
    if (isTopicSelected(id(node)) && isMultiSelection()) {
      // console.log('drag multi', selection.topicIds)
      emitTopicsDrag()
    } else {
      // console.log('drag single', id(node))
      emitTopicDrag(node)
    }
  }
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

// Viewport

/**
 * Sets the viewport programmatically *without* emitting a (Cytoscape) `viewport` event.
 */
function setViewport (pan, zoom) {
  cy.off('viewport', onViewport)
  cy.viewport({pan, zoom})
  cy.on('viewport', onViewport)
}

function onViewport () {
  dispatch('_syncViewport', {
    pan: cy.pan(),
    zoom: cy.zoom()
  })
}

// Animation

// Note: instead of returning a promise we take a callback, because debounced functions can't return anything
const playFisheyeAnimation = dm5.utils.debounce(callback => {
  // console.log('playFisheyeAnimation')
  fisheyeAnimation && fisheyeAnimation.stop()
  fisheyeAnimation = cy.layout({
    name: 'cose-bilkent',
    stop: callback,
    fit: false,
    /* animateFilter: (node, i) => {
      if (isAuxNode(node)) {
        console.log(node.id(), isAuxNode(node), node.position(), node.renderedPosition())
        // return false
      }
      return true // !isAuxNode(node)
    }, */
    randomize: false,
    nodeRepulsion: 0,
    idealEdgeLength: 0,
    edgeElasticity: 0,
    tile: false
  }).run()
}, 300)

// Helper

/**
 * Builds a Cytoscape node from a dm5.ViewTopic
 *
 * @param   viewTopic   A dm5.ViewTopic
 */
function cyNode (viewTopic) {
  return {
    data: {
      id:              viewTopic.id,
      label:           viewTopic.value.toString(),    // treat Number/Boolean values as strings, expected by nodeLabel()
      icon:            viewTopic.icon,
      iconColor:       viewTopic.iconColor,
      backgroundColor: viewTopic.backgroundColor,
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
      source:  viewAssoc.player1.id,
      target:  viewAssoc.player2.id,
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

function isAuxNode (node) {
  return ec.isAuxNode(node)
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
