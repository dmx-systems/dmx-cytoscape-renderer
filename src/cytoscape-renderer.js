import CytoscapeHelper from './cytoscape-helper'
import Vue from 'vue'
import dm5 from 'dm5'

var cyHelper
var svgReady              // a promise resolved once the FontAwesome SVG is loaded
var fisheyeAnimation

const state = {

  cy: undefined,          // the Cytoscape instance
  ele: undefined,         // Selected Cytoscape element (node or edge).
                          // Undefined if there is no selection.

  topicmap: undefined,    // view model: the rendered topicmap (dm5.Topicmap)
  object: undefined,      // view model: the selected object (dm5.DeepaMehtaObject)
  writable: undefined,    // True if the current user has WRITE permission for the selected object

  details: {},            // In-map details. Detail records keyed by object ID:
                          //  {
                          //    id        ID of "object" (Number). May be set before "object" is available.
                          //    object    The object whose details to be shown (dm5.Topic, dm5.Assoc)
                          //    ele       The original Cytoscape element (node or edge) representing the object
                          //    node      The "detail node": either "ele" (if "ele" is a node),
                          //              or the "aux node" (if "ele" is an edge)
                          //    size      The size (in pixel) of the detail DOM (object with "width" and "height" props)
                          //    writable  True if the current user has WRITE permission for "object" (boolean)
                          //    pinned    Whether the detail is pinned or not (boolean)
                          //  }
}

const actions = {

  // Module internal

  _initCytoscape (_, {container, box}) {
    cyHelper = new CytoscapeHelper(container, box)
    state.cy = cyHelper.cy
    svgReady = cyHelper.svgReady
  },

  _syncObject (_, object) {
    state.object = object
  },

  _syncWritable (_, writable) {
    state.writable = writable
  },

  _syncDetailSize (_, id) {
    // console.log('_syncDetailSize', id)
    measureDetail(detail(id))
  },

  _playFisheyeAnimation () {
    playFisheyeAnimation()
  },

  _shutdownCytoscape () {
    // console.log('Unregistering cxtmenu extension')
    // TODO: not supported by Cytoscape
  },

  // Cross-Module

  // The "sync" actions adapt (Cytoscape) view to ("topicmap") model changes

  /**
   * @returns   a promise resolved once topicmap rendering is complete.
   */
  syncTopicmap (_, topicmap) {
    // console.log('syncTopicmap', topicmap.id)
    state.topicmap = topicmap
    return new Promise(resolve => {
      svgReady.then(renderTopicmap).then(showPinnedDetails).then(resolve)
    })
  },

  syncStyles (_, assocTypeColors) {
    // console.log('syncStyles', assocTypeColors)
    for (const typeUri in assocTypeColors) {
      state.cy.style().selector(`edge[typeUri='${typeUri}']`).style({'line-color': assocTypeColors[typeUri]})
    }
  },

  syncAddTopic (_, id) {
    // console.log('syncAddTopic', id)
    const viewTopic = state.topicmap.getTopic(id)
    initPos(viewTopic)
    state.cy.add(cyNode(viewTopic))
  },

  syncAddAssoc (_, id) {
    // console.log('syncAddAssoc', id)
    const assoc = state.topicmap.getAssoc(id)
    if (!assoc.hasAssocPlayer()) {    // this renderer doesn't support assoc-connected assocs
      state.cy.add(cyEdge(assoc))
    }
  },

  syncTopic (_, id) {
    // console.log('syncTopic', id)
    cyElement(id).data('label', state.topicmap.getTopic(id).value)
  },

  syncAssoc (_, id) {
    // console.log('syncAssoc', id)
    const assoc = state.topicmap.getAssoc(id)
    cyElement(id).data({
      typeUri: assoc.typeUri,
      label:   assoc.value
    })
  },

  /**
   * Renders given topic/assoc as selected.
   * Shows the detail DOM and plays the fisheye animation.
   *
   * Precondition:
   * - the topicmap rendering is complete.
   *
   * @param   id  id of a topic or an assoc
   * @param   p   a promise resolved once topic/assoc data has arrived (global "object" state is up-to-date).
   *              Note: the detail overlay's size can only be measured once "object" details are rendered.
   */
  syncSelect (_, {id, p}) {
    // console.log('syncSelect', id)
    // Note 1: programmatic unselect() is required for browser history navigation. When *interactively* selecting a node
    // Cytoscape removes the current selection before. When *programmatically* selecting a node Cytoscape does *not*
    // remove the current selection.
    // Note 2: the fisheye animation can only be started once the restore animation is complete, *and* "object" is
    // available. The actual order of these 2 occasions doesn't matter.
    Promise.all([p, ...state.ele ? [unselectElement()] : []]).then(() => {
      // console.log('restore animation complete')
      state.ele = cyElement(id).select()    // select() restores selection after switching topicmap
      if (state.ele.size() != 1) {
        throw Error(`Element ${id} not found (${state.ele.size()})`)
      }
      showDetail(createSelectionDetail())
    })
  },

  syncUnselect () {
    // console.log('syncUnselect')
    unselectElement().then(playFisheyeAnimationIfDetailsOnscreen)
    state.ele = undefined
  },

  syncTopicPosition (_, id) {
    // console.log('syncTopicPosition', id)
    _syncTopicPosition(id)
  },

  syncTopicVisibility (_, id) {
    console.log('syncTopicVisibility', id)
    const viewTopic = state.topicmap.getTopic(id)
    if (viewTopic.isVisible()) {
      state.cy.add(cyNode(viewTopic))
    } else {
      cyElement(id).remove()
    }
  },

  syncPinned (_, {objectId, pinned}) {
    // console.log('syncPinned', objectId, pinned)
    if (!pinned && !isSelected(objectId)) {
      removeDetail(detail(objectId)).then(playFisheyeAnimationIfDetailsOnscreen)
    }
  },

  syncRemoveTopic (_, id) {
    // console.log('syncRemoveTopic', id)
    cyElement(id).remove()
  },

  syncRemoveAssoc (_, id) {
    // console.log('syncRemoveAssoc', id)
    cyElement(id).remove()
  },

  resizeTopicmapRenderer () {
    // console.log('resizeTopicmapRenderer')
    state.cy.resize()
  },

  // WebSocket messages

  _processDirectives (_, directives) {
    // console.log(`Topicmap Panel: processing ${directives.length} directives`)
    directives.forEach(dir => {
      switch (dir.type) {
      case "UPDATE_TOPIC":
        updateDetail(new dm5.Topic(dir.arg))
        break
      case "DELETE_TOPIC":
        // TODO?
        break
      case "UPDATE_ASSOCIATION":
        updateDetail(new dm5.Assoc(dir.arg))
        break
      case "DELETE_ASSOCIATION":
        // TODO?
        break
      }
    })
  }
}

export default {
  state,
  actions
}

// ---

function showPinnedDetails () {
  state.topicmap.forEachTopic(viewTopic => {
    if (viewTopic.isVisible()) {
      if (viewTopic.getViewProp('dm4.topicmaps.pinned')) {
        createDetail(viewTopic, cyElement(viewTopic.id)).then(detail => {
          showDetail(detail)
        })
      }
    }
  })
  state.topicmap.forEachAssoc(viewAssoc => {
    if (!viewAssoc.hasAssocPlayer()) {    // this renderer doesn't support assoc-connected assocs
      if (viewAssoc.getViewProp('dm4.topicmaps.pinned')) {
        createDetail(viewAssoc, cyElement(viewAssoc.id)).then(detail => {
          showDetail(detail)
        })
      }
    }
  })
}

/**
 * Creates a detail record for the given element.
 */
function createDetail (viewObject, ele) {
  return new Promise(resolve => {
    const detail = {
      id: eleId(ele),
      object: undefined,
      ele,
      node: ele.isNode() ? ele : createAuxNode(ele),
      size: undefined,
      writable: undefined,
      // Note: a property would not be reactive. With a getter it works.
      get pinned () {
        return viewObject.getViewProp('dm4.topicmaps.pinned')
      }
    }
    viewObject.fetchObject().then(object => {
      detail.object = object.isType() ? object.asType() : object    // logical copy in displayObject() (webclient.js)
      resolve(detail)
    })
    viewObject.isWritable().then(writable => {
      detail.writable = writable
    })
  })
}

/**
 * Creates a detail record for the current selection.
 */
function createSelectionDetail () {
  const id = eleId(state.ele)
  const viewObject = state.ele.isNode() ? state.topicmap.getTopic(id) :
                                          state.topicmap.getAssoc(id)
  return {
    id,
    object: state.object,
    ele: state.ele,
    node: state.ele.isNode() ? state.ele : createAuxNode(state.ele),
    size: undefined,
    // Note: properties would not be reactive. With getters it works.
    get writable () {
      return state.writable
    },
    get pinned () {
      return viewObject.getViewProp('dm4.topicmaps.pinned')
    }
  }
}

/**
 * Measures the size of the given detail, resizes the detail node, and plays the fisheye animation.
 *
 * Precondition:
 * - the DOM is updated already.
 *
 * @param   detail    a detail record
 */
function measureDetail(detail) {
  const detailDOM = document.querySelector(`.dm5-detail-layer .dm5-detail[data-detail-id="${detail.id}"]`)
  if (!detailDOM) {
    throw Error(`Detail DOM ${detail.id} not found`)
  }
  detail.size = {   // FIXME: use Vue.set()?
    width:  detailDOM.clientWidth,
    height: detailDOM.clientHeight
  }
  // console.log('measureDetail', node.id(), state.size.width, state.size.height)
  detail.node.style(detail.size)
  playFisheyeAnimation()
}

function playFisheyeAnimation() {
  fisheyeAnimation && fisheyeAnimation.stop()
  fisheyeAnimation = state.cy.layout({
    name: 'cose-bilkent',
    stop () {
      // console.log('fisheye animation complete')
    },
    // animate: 'end',
    // animationDuration: 3000,
    fit: false,
    randomize: false,
    nodeRepulsion: 0,
    idealEdgeLength: 0,
    edgeElasticity: 0,
    tile: false
  }).run()
}

function playFisheyeAnimationIfDetailsOnscreen () {
  if (!dm5.utils.isEmpty(state.details)) {
    playFisheyeAnimation()
  }
}

function renderTopicmap () {
  const eles = []
  state.topicmap.forEachTopic(viewTopic => {
    if (viewTopic.isVisible()) {
      eles.push(cyNode(viewTopic))
    }
  })
  state.topicmap.forEachAssoc(assoc => {
    if (!assoc.hasAssocPlayer()) {    // this renderer doesn't support assoc-connected assocs
      eles.push(cyEdge(assoc))
    }
  })
  state.cy.remove("*")  // "*" is the group selector "all"
  state.cy.add(eles)
  // console.log('### Topicmap rendering complete!')
}

/**
 * @return  a promise resolved once the animation is complete.
 */
function _syncTopicPosition (id) {
  return cyElement(id).animation({
    // duration: 3000,
    position: state.topicmap.getTopic(id).getPosition(),
    easing: 'ease-in-out-cubic'
  }).play().promise()
}

/**
 * Unselects the selected element, removes the corresponding detail (if not pinned), and plays the restore animation.
 *
 * Precondition:
 * - an element is selected
 *
 * @return  a promise resolved once the restore animation is complete.
 */
function unselectElement () {
  // console.log('unselectElement', state.cy.elements(":selected").size(), state.ele)
  if (!state.ele) {
    throw Error('unselectElement when no element is selected')
  }
  // Note 1: when the user clicks on the background Cytoscape unselects the selected element on its own.
  // Calling cy.elements(":selected") afterwards would return an empty collection.
  // This is why we maintain an explicit "ele" state.
  // Note 2: unselect() removes the element's selection style when manually stripping topic/assoc from
  // browser URL. In this situation cy.elements(":selected") would return a non-empty collection.
  state.ele.unselect()
  const detail = selectionDetail()
  return !detail.pinned ? removeDetail(detail) : Promise.resolve()
}

function showDetail (detail) {
  Vue.set(state.details, detail.id, detail)     // Vue.set() triggers dm5-detail-layer rendering
  Vue.nextTick(() => {
    measureDetail(detail)
  })
}

/**
 * Removes the given detail from screen and plays the restore animation.
 *
 * @return  a promise resolved once the restore animation is complete.
 */
function removeDetail (detail) {
  // remove detail DOM
  Vue.delete(state.details, detail.id)          // Vue.delete() triggers dm5-detail-layer rendering
  // adjust Cytoscape view
  if (detail.ele.isNode()) {
    detail.ele.style({width: '', height: ''})   // reset size
  } else {
    state.cy.remove(detail.node)                // remove aux node
  }
  return playRestoreAnimation()
}

function updateDetail (object) {
  const detail = Object.values(state.details).find(detail => detail.id === object.id)
  if (detail) {
    detail.object = object
  }
}

/**
 * @return  a promise resolved once the animation is complete.
 */
function playRestoreAnimation () {
  const promises = []
  // console.log('starting restore animation')
  state.topicmap.forEachTopic(viewTopic => {
    if (viewTopic.isVisible()) {
      promises.push(_syncTopicPosition(viewTopic.id))
    }
  })
  return Promise.all(promises)
}

function selectionDetail () {
  if (!state.ele) {
    throw Error('selectionDetail() when nothing is selected')
  }
  return detail(eleId(state.ele))
}

function detail (id) {
  const detail = state.details[id]
  if (!detail) {
    throw Error(`Detail record ${id} not found`)
  }
  return detail
}

/**
 * Creates an auxiliary node to represent the given edge.
 */
function createAuxNode (edge) {
  return state.cy.add({
    data: {
      assocId: eleId(edge),            // Holds original edge ID. Needed by context menu.
      icon: '\uf10c'                // model.js DEFAULT_TOPIC_ICON
    },
    position: edge.midpoint(),
    classes: 'aux'
  })
}

/**
 * Auto-position topic if no position is set.
 */
function initPos (viewTopic) {
  console.log('initPos', viewTopic.id, viewTopic.getViewProp('dm4.topicmaps.x') !== undefined,
    state.object && state.object.id)
  if (viewTopic.getViewProp('dm4.topicmaps.x') === undefined) {
    const pos = {}
    if (state.object) {
      // If there is a topic selection: place lower/right to the selected topic
      // TODO: more elaborated placement, e.g. at near free position?
      // FIXME: check for *topic* selection
      const p = state.topicmap.getTopic(state.object.id).getPosition()
      pos.x = p.x + 50
      pos.y = p.y + 50
    } else {
      pos.x = 100
      pos.y = 100
    }
    viewTopic.setPosition(pos)
  }
}

/**
 * Builds a Cytoscape node from a dm5.ViewTopic
 *
 * @param   viewTopic   A dm5.ViewTopic
 */
function cyNode (viewTopic) {
  return {
    data: {
      id:    viewTopic.id,
      label: viewTopic.value,
      icon:  viewTopic.getIcon()
    },
    position: viewTopic.getPosition()
  }
}

/**
 * Builds a Cytoscape edge from a dm5.Assoc
 *
 * @param   assoc   A dm5.Assoc
 */
function cyEdge (assoc) {
  return {
    data: {
      id:      assoc.id,
      typeUri: assoc.typeUri,
      label:   assoc.value,
      source:  assoc.role1.topicId,
      target:  assoc.role2.topicId
    }
  }
}

/**
 * Gets the Cytoscape element with the given ID.
 *
 * @param   id    a DM object id (number)
 *
 * @return  A collection of 1 or 0 elements.
 */
function cyElement (id) {
  return state.cy.getElementById(id.toString())   // Note: a Cytoscape element ID is a string
}

function isSelected (objectId) {
  return state.ele && eleId(state.ele) === objectId
}

// copy in dm5.cytoscape-renderer.vue and dm5-detail-layer.vue
function eleId (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}
