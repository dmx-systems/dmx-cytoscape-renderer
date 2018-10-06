import CytoscapeView from './cytoscape-view'
import Vue from 'vue'
import dm5 from 'dm5'

var cyView                // the CytoscapeView instance
var fisheyeAnimation

const state = {

  // Model

  topicmap: undefined,            // the rendered topicmap (dm5.Topicmap)
  topicmapWritable: undefined,    // True if the current user has WRITE permission for the rendered topicmap
  selection: undefined,           // the selection model of the rendered topicmap (a Selection object)

  object: undefined,              // the selected object (dm5.DeepaMehtaObject)
  objectWritable: undefined,      // True if the current user has WRITE permission for the selected object

  // Cytoscape View

  ele: undefined,         // The single selection: a selected Cytoscape element (node or edge). Undefined if there is no
                          // single selection.
                          // The selected element's details are displayed in-map. On unselect the details disappear
                          // (unless pinned).
                          // Note: the host application can visualize multi selections by the means of '_syncSelect' and
                          // '_syncUnselect' actions. The details of multi selection elements are *not* displayed in-map
                          // (unless pinned). ### TODO: introduce multi-selection state in this component?

  details: {},            // In-map details. Detail records keyed by object ID:
                          //  {
                          //    id        ID of "object" (Number). May be set before "object" is actually available.
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

  // === Model ===

  fetchTopicmap (_, id) {
    // console.log('fetchTopicmap', id, '(topicmap-model)')
    return dm5.restClient.getTopicmap(id)
  },

  // TODO: rename "reveal" functions to "show"

  /**
   * Reveals a topic on the topicmap panel.
   *
   * @param   topic   the topic to reveal (dm5.Topic).
   * @param   pos     Optional: the topic position in model coordinates (object with "x", "y" props).
   *                  If not given it's up to the topicmap renderer to position the topic.
   * @param   select  Optional: if trueish the revealed topic is selected programmatically.
   */
  revealTopic ({dispatch}, {topic, pos, select}) {
    // update state + sync view
    const op = _revealTopic(topic, pos, select, dispatch)
    // update server
    if (state.topicmapWritable) {
      if (op.type === 'add') {
        dm5.restClient.addTopicToTopicmap(state.topicmap.id, topic.id, op.viewProps)
      } else if (op.type === 'show') {
        dm5.restClient.setTopicVisibility(state.topicmap.id, topic.id, true)
      }
    }
  },

  revealAssoc ({dispatch}, {assoc, select}) {
    // update state + sync view
    const op = _revealAssoc(assoc, select, dispatch)
    // update server
    if (state.topicmapWritable) {
      if (op.type === 'add') {
        dm5.restClient.addAssocToTopicmap(state.topicmap.id, assoc.id, op.viewProps)
      }
    }
  },

  // TODO: add "select" param?
  revealRelatedTopic ({dispatch}, relTopic) {
    // update state + sync view
    const topicOp = _revealTopic(relTopic, undefined, true, dispatch)   // pos=undefined, select=true
    const assocOp = _revealAssoc(relTopic.assoc, false, dispatch)       // select=false
    // update server
    if (state.topicmapWritable) {
      if (topicOp.type || assocOp.type) {
        dm5.restClient.addRelatedTopicToTopicmap(state.topicmap.id, relTopic.id, relTopic.assoc.id, topicOp.viewProps)
      }
    }
  },

  /**
   * Preconditions:
   * - the topic belongs to the selected topicmap
   * - the view is up-to-date
   * - the server is *not* yet up-to-date
   */
  setTopicPosition (_, {id, pos}) {
    // console.log('setTopicPosition', id)
    // update state
    state.topicmap.getTopic(id).setPosition(pos)
    // sync view (up-to-date already)
    // update server
    if (state.topicmapWritable) {
      dm5.restClient.setTopicPosition(state.topicmap.id, id, pos)
    }
  },

  /**
   * Preconditions:
   * - the topics belong to the selected topicmap
   * - the view is up-to-date
   * - the server is *not* yet up-to-date
   *
   * @param   coords    array of 3-prop objects: 'topicId', 'x', 'y'
   */
  setTopicPositions (_, coords) {
    console.log('setTopicPositions', coords)
    // update state
    coords.forEach(coord =>
      state.topicmap.getTopic(coord.topicId).setPosition({
        x: coord.x,
        y: coord.y
      })
    )
    // sync view (up-to-date already)
    // update server
    if (state.topicmapWritable) {
      dm5.restClient.setTopicPositions(state.topicmap.id, coords)
    }
  },

  // TODO: move update-server aspect to main application? Move this action to webclient.js?
  hideMulti ({dispatch}, idLists) {
    console.log('hideMulti', idLists.topicIds, idLists.assocIds)
    // update state + sync view (for immediate visual feedback)
    idLists.topicIds.forEach(id => dispatch('_hideTopic', id))
    idLists.assocIds.forEach(id => dispatch('_hideAssoc', id))
    // update server
    if (state.topicmapWritable) {
      dm5.restClient.hideMulti(state.topicmap.id, idLists)
    }
  },

  setTopicPinned ({dispatch}, {topicId, pinned}) {
    console.log('setTopicPinned', topicId, pinned)
    // update state + sync view
    _setTopicPinned(topicId, pinned, dispatch)
    // update server
    dm5.restClient.setTopicViewProps(state.topicmap.id, topicId, {    // FIXME: check topicmapWritable?
      'dmx.topicmaps.pinned': pinned
    })
  },

  setAssocPinned ({dispatch}, {assocId, pinned}) {
    console.log('setAssocPinned', assocId, pinned)
    // update state + sync view
    _setAssocPinned(assocId, pinned, dispatch)
    // update server
    dm5.restClient.setAssocViewProps(state.topicmap.id, assocId, {    // FIXME: check topicmapWritable?
      'dmx.topicmaps.pinned': pinned
    })
  },

  /**
   * Low-level action that updates client state and syncs the view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single topic.
   * Hiding is always performed as a multi-operation, that is in a single request.
   */
  _hideTopic ({dispatch}, id) {
    unpinTopicIfPinned(id, dispatch)
    // update state
    state.topicmap.removeAssocs(id)
    state.topicmap.getTopic(id).setVisibility(false)
    // sync view
    dispatch('syncRemoveTopic', id)
  },

  /**
   * Low-level action that updates client state and syncs the view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single assoc.
   * Hiding is always performed as a multi-operation, that is in a single request.
   */
  _hideAssoc ({dispatch}, id) {
    // If the assoc is not in the topicmap nothing is performed. This can happen while hide-multi.
    if (state.topicmap.hasAssoc(id)) {
      unpinAssocIfPinned(id, dispatch)
      // update state
      state.topicmap.removeAssoc(id)
      // sync view
      dispatch('syncRemoveAssoc', id)
    }
  },

  /**
   * Low-level action that updates client state and syncs the view.
   * Server state is *not* updated as done by deleteMulti() high-level action (see dm4-webclient/webclient.js).
   *
   * Note: there is no high-level action to delete a single topic.
   * Deleting is always performed as a multi-operation, that is in a single request.
   */
  _deleteTopic ({dispatch}, id) {
    _unpinTopicIfPinned(id, dispatch)
    // update state
    state.topicmap.removeAssocs(id)
    state.topicmap.removeTopic(id)
    // sync view
    dispatch('syncRemoveTopic', id)
  },

  /**
   * Low-level action that updates client state and syncs the view.
   * Server state is *not* updated as done by deleteMulti() high-level action (see dm4-webclient/webclient.js).
   *
   * Note: there is no high-level action to delete a single assoc.
   * Deleting is always performed as a multi-operation, that is in a single request.
   */
  _deleteAssoc ({dispatch}, id) {
    _unpinAssocIfPinned(id, dispatch)
    // update state
    state.topicmap.removeAssoc(id)
    // sync view
    dispatch('syncRemoveAssoc', id)
  },

  // WebSocket messages

  _addTopicToTopicmap ({dispatch}, {topicmapId, viewTopic}) {
    if (topicmapId === state.topicmap.id) {
      state.topicmap.addTopic(new dm5.ViewTopic(viewTopic))               // update state
      dispatch('syncAddTopic', viewTopic.id)                              // sync view
    }
  },

  _addAssocToTopicmap ({dispatch}, {topicmapId, assoc}) {
    if (topicmapId === state.topicmap.id) {
      state.topicmap.addAssoc(new dm5.ViewAssoc(assoc))                   // update state
      dispatch('syncAddAssoc', assoc.id)                                  // sync view
    }
  },

  _setTopicPosition ({dispatch}, {topicmapId, topicId, pos}) {
    if (topicmapId === state.topicmap.id) {
      state.topicmap.getTopic(topicId).setPosition(pos)                   // update state
      dispatch('syncTopicPosition', topicId)                              // sync view
    }
  },

  _setTopicVisibility ({dispatch}, {topicmapId, topicId, visibility}) {
    if (topicmapId === state.topicmap.id) {
      // update state
      if (!visibility) {
        state.topicmap.removeAssocs(topicId)
      }
      state.topicmap.getTopic(topicId).setVisibility(visibility)
      // sync view
      dispatch('syncTopicVisibility', topicId)
    }
  },

  _removeAssocFromTopicmap ({dispatch}, {topicmapId, assocId}) {
    if (topicmapId === state.topicmap.id) {
      // update state
      state.topicmap.removeAssoc(assocId)
      // sync view
      dispatch('syncRemoveAssoc', assocId)
    }
  },

  _processDirectives ({dispatch}, directives) {
    // console.log(`Topicmap Panel: processing ${directives.length} directives`)
    directives.forEach(dir => {
      switch (dir.type) {
      case "UPDATE_TOPIC":
        const topic = new dm5.Topic(dir.arg)
        updateTopic(topic, dispatch)
        updateDetail(topic)
        break
      case "DELETE_TOPIC":
        deleteTopic(dir.arg, dispatch)
        break
      case "UPDATE_ASSOCIATION":
        updateAssoc(dir.arg, dispatch)
        updateDetail(new dm5.Assoc(dir.arg))
        break
      case "DELETE_ASSOCIATION":
        deleteAssoc(dir.arg, dispatch)
        break
      }
    })
  },

  // === Cytoscape View ===

  // TODO: transform these actions into CytoscapeView methods?

  // Module internal

  /**
   * @param   renderer    the dm5-cytoscape-renderer (a Vue instance)
   * @param   parent      the dm5-topicmap-panel (a Vue instance)
   * @param   container   the container DOM element for the Cytoscape instance
   * @param   box         the DOM element used for measurement
   */
  _initCytoscape ({dispatch}, {renderer, parent, container, box, contextCommands}) {
    // console.log('_initCytoscape')
    cyView = new CytoscapeView(renderer, parent, container, box, contextCommands, state, dispatch)
  },

  _syncObject (_, object) {
    // console.log('_syncObject', object)
    state.object = object
  },

  _syncWritable (_, writable) {
    state.objectWritable = writable
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
  renderTopicmap (_, {topicmap, writable, selection}) {
    // console.log('renderTopicmap', topicmap.id)
    state.topicmap = topicmap
    state.topicmapWritable = writable
    state.selection = selection
    state.ele = undefined
    state.details = {}
    return cyView.svgReady.then(renderTopicmap).then(showPinnedDetails)
  },

  syncStyles (_, assocTypeColors) {
    // console.log('syncStyles', assocTypeColors)
    for (const typeUri in assocTypeColors) {
      cyView.cy.style().selector(`edge[typeUri='${typeUri}']`).style({'line-color': assocTypeColors[typeUri]})
    }
  },

  syncAddTopic (_, id) {
    // console.log('syncAddTopic', id)
    const viewTopic = state.topicmap.getTopic(id)
    initPos(viewTopic)
    cyView.cy.add(cyNode(viewTopic))
  },

  syncAddAssoc (_, id) {
    // console.log('syncAddAssoc', id)
    const assoc = state.topicmap.getAssoc(id)
    if (!assoc.hasAssocPlayer()) {    // this renderer doesn't support assoc-connected assocs
      cyView.cy.add(cyEdge(assoc))
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
   * - the topicmap rendering is complete
   *
   * Postcondition:
   * - state.ele is up-to-date
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
      showDetail(createSelectionDetail())
    })
    state.ele = cyView.select(cyElement(id))    // select() restores selection after switching topicmap
    if (state.ele.size() !== 1) {
      throw Error(`can't select element ${id} (not found in topicmap ${state.topicmap.id})`)
    }
  },

  syncUnselect () {
    // console.log('syncUnselect')
    unselectElement().then(playFisheyeAnimationIfDetailsOnscreen)
    state.ele = undefined
  },

  /**
   * Renders an element as selected without displaying the element's details.
   * Called by host application to visualize a multi selection.
   *
   * @throws  if this component is in single selection state.
   */
  _syncSelect (_, id) {
    // console.log('_syncSelect', id)
    if (state.ele) {
      throw Error(`_syncSelect(${id}) called when state.ele is set (${eleId(state.ele)})`)
    }
    cyView.select(cyElement(id))
  },

  /**
   * Renders an element as unselected without removing the element's details (and without playing the restore
   * animation). Called by host application to visually remove a multi selection (e.g. after a route switch).
   *
   * @throws  if this component is not in single selection state.
   */
  _syncUnselect (_, id) {
    // console.log('_syncUnselect', id)
    if (!state.ele) {
      throw Error(`_syncUnselect(${id}) called when state.ele is not set`)
    }
    cyView.unselect(cyElement(id))    // TODO: assert that cyElement() not empty?
  },

  syncTopicPosition (_, id) {
    // console.log('syncTopicPosition', id)
    _syncTopicPosition(id)
  },

  syncTopicVisibility (_, id) {
    // console.log('syncTopicVisibility', id)
    const viewTopic = state.topicmap.getTopic(id)
    if (viewTopic.isVisible()) {
      cyView.cy.add(cyNode(viewTopic))
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
    cyView.cy.resize()
  }
}

const getters = {
  visibleTopicIds (state) {
    // Note: at startup state.topicmap is undefined
    // console.log('visibleTopicIds getter', state.topicmap && state.topicmap.visibleTopicIds())
    return state.topicmap && state.topicmap.visibleTopicIds()
  }
}

export default {
  state,
  actions,
  getters
}

// === Model ===

// Update state + sync view

/**
 * @param   topic   the topic to reveal (dm5.Topic).
 * @param   pos     Optional: the topic position in model coordinates (object with "x", "y" props).
 *                  If not given it's up to the topicmap renderer to position the topic.
 * @param   select  Optional: if trueish the revealed topic is selected programmatically.
 */
function _revealTopic (topic, pos, select, dispatch) {
  // update state
  const op = state.topicmap.revealTopic(topic, pos)
  // sync view
  if (op.type === 'add' || op.type === 'show') {
    dispatch('syncAddTopic', topic.id)
  }
  select && dispatch('callTopicRoute', topic.id)     // TODO: don't dispatch into host application
  return op
}

function _revealAssoc (assoc, select, dispatch) {
  // update state
  const op = state.topicmap.revealAssoc(assoc)
  // sync view
  if (op.type === 'add') {
    dispatch('syncAddAssoc', assoc.id)
  }
  select && dispatch('callAssocRoute', assoc.id)     // TODO: don't dispatch into host application
  return op
}

function _setTopicPinned (topicId, pinned, dispatch) {
  // update state
  state.topicmap.getTopic(topicId).setPinned(pinned)
  // sync view
  dispatch('syncPinned', {objectId: topicId, pinned})
}

function _setAssocPinned (assocId, pinned, dispatch) {
  // update state
  state.topicmap.getAssoc(assocId).setPinned(pinned)
  // sync view
  dispatch('syncPinned', {objectId: assocId, pinned})
}

// Process directives

/**
 * Processes an UPDATE_TOPIC directive.
 * Updates the topicmap model when a topic value has changed.
 */
function updateTopic (topic, dispatch) {
  // console.log('updateTopic', topic)
  const _topic = state.topicmap.getTopicIfExists(topic.id)
  if (_topic) {
    _topic.value = topic.value              // update state
    dispatch('syncTopic', topic.id)         // sync view
  }
}

/**
 * Processes an UPDATE_ASSOCIATION directive.
 */
function updateAssoc (assoc, dispatch) {
  const _assoc = state.topicmap.getAssocIfExists(assoc.id)
  if (_assoc) {
    _assoc.value = assoc.value              // update state
    _assoc.typeUri = assoc.typeUri          // update state
    dispatch('syncAssoc', assoc.id)         // sync view
  }
}

/**
 * Processes a DELETE_TOPIC directive.
 */
function deleteTopic (topic, dispatch) {
  const _topic = state.topicmap.getTopicIfExists(topic.id)
  if (_topic) {
    // Note: state.topicmap.removeAssocs() is not called here (compare to _deleteTopic() action above).
    // The assocs will be removed while processing the DELETE_ASSOCIATION directives as received along with the
    // DELETE_TOPIC directive.
    state.topicmap.removeTopic(topic.id)    // update state
    dispatch('syncRemoveTopic', topic.id)   // sync view
  }
}

/**
 * Processes a DELETE_ASSOCIATION directive.
 */
function deleteAssoc (assoc, dispatch) {
  const _assoc = state.topicmap.getAssocIfExists(assoc.id)
  if (_assoc) {
    state.topicmap.removeAssoc(assoc.id)    // update state
    dispatch('syncRemoveAssoc', assoc.id)   // sync view
  }
}

//

function unpinTopicIfPinned (id, dispatch) {
  if (state.topicmap.getTopic(id).isPinned()) {
    // TODO: don't send request. Make unpin implicit to hide at server-side.
    dispatch('setTopicPinned', {topicId: id, pinned: false})      // update state + sync view + update server
  }
}

function unpinAssocIfPinned (id, dispatch) {
  if (state.topicmap.getAssoc(id).isPinned()) {
    // TODO: don't send request. Make unpin implicit to hide at server-side.
    dispatch('setAssocPinned', {assocId: id, pinned: false})      // update state + sync view + update server
  }
}

function _unpinTopicIfPinned (id, dispatch) {
  if (state.topicmap.getTopic(id).isPinned()) {
    _setTopicPinned(id, false, dispatch)                          // update state + sync view
  }
}

function _unpinAssocIfPinned (id, dispatch) {
  if (state.topicmap.getAssoc(id).isPinned()) {
    _setAssocPinned(id, false, dispatch)                          // update state + sync view
  }
}

// === Cytoscape View ===

function showPinnedDetails () {
  state.topicmap.forEachTopic(viewTopic => {
    if (viewTopic.isVisible() && viewTopic.isPinned()) {
      createDetail(viewTopic, cyElement(viewTopic.id)).then(detail => {
        showDetail(detail)
      })
    }
  })
  state.topicmap.forEachAssoc(viewAssoc => {
    // this renderer doesn't support assoc-connected assocs
    if (!viewAssoc.hasAssocPlayer() && viewAssoc.isPinned()) {
      createDetail(viewAssoc, cyElement(viewAssoc.id)).then(detail => {
        showDetail(detail)
      })
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
        return viewObject.isPinned()
      }
    }
    viewObject.fetchObject().then(object => {
      detail.object = object.isType() ? object.asType() : object    // logical copy in updateDetail()
      resolve(detail)
    })
    viewObject.isWritable().then(writable => {
      detail.writable = writable
    })
  })
}

/**
 * Creates a detail record for the current selection.
 *
 * Precondition:
 * - state.ele state is up-to-date
 * - "object" state is up-to-date
 *
 * @return  the created detail record
 */
function createSelectionDetail () {
  // console.log('createSelectionDetail', state.object)
  const id = eleId(state.ele)
  var node, viewObject
  if (state.ele.isNode()) {
    node = state.ele
    viewObject = state.topicmap.getTopic(id)
  } else {
    node = createAuxNode(state.ele)
    cyView.select(node)     // select aux node along with assoc
    viewObject = state.topicmap.getAssoc(id)
  }
  return {
    id,
    object: state.object,
    ele: state.ele,
    node,
    size: undefined,
    // Note: properties would not be reactive. With getters it works.
    get writable () {
      return state.objectWritable
    },
    get pinned () {
      return viewObject.isPinned()
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
    throw Error(`detail DOM ${detail.id} not found`)
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
  fisheyeAnimation = cyView.cy.layout({
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
  cyView.cy.remove("*")  // "*" is the group selector "all"
  cyView.cy.add(eles)
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
  if (!state.ele) {
    throw Error('unselectElement() called when no element is selected')
  }
  // console.log('unselectElement', eleId(state.ele), cyView.cy.elements(":selected").size())
  // Note 1: when the user clicks on the background Cytoscape unselects the selected element on its own.
  // Calling cy.elements(":selected") afterwards would return an empty collection.
  // This is why we maintain an explicit "ele" state.
  // Note 2: unselect() removes the element's selection style when manually stripping topic/assoc from
  // browser URL. In this situation cy.elements(":selected") would return a non-empty collection.
  cyView.unselect(state.ele)
  const detail = selectionDetail()
  return !detail.pinned ? removeDetail(detail) : Promise.resolve()
}

function showDetail (detail) {
  detail.node.addClass('expanded')
  Vue.set(state.details, detail.id, detail)       // Vue.set() triggers dm5-detail-layer rendering
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
  // update state
  Vue.delete(state.details, detail.id)            // Vue.delete() triggers dm5-detail-layer rendering
  // sync view
  if (detail.ele.isNode()) {
    detail.node.removeClass('expanded')
    detail.node.style({width: '', height: ''})    // reset size
  } else {
    cyView.cy.remove(detail.node)                 // remove aux node
  }
  return playRestoreAnimation()
}

function updateDetail (object) {
  const detail = Object.values(state.details).find(detail => detail.id === object.id)
  if (detail) {
    detail.object = object.isType() ? object.asType() : object    // logical copy in createDetail()
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
    throw Error('selectionDetail() called when nothing is selected')
  }
  return detail(eleId(state.ele))
}

function detail (id) {
  const detail = state.details[id]
  if (!detail) {
    throw Error(`detail record ${id} not found`)
  }
  return detail
}

/**
 * Creates an auxiliary node to represent the given edge, and adds it to the Cytoscape graph.
 *
 * @return  the created aux node (a Cytoscape element)
 */
function createAuxNode (edge) {
  return cyView.cy.add({
    // Note: the aux node ID is generated by Cytoscape. IDs of aux nodes are not relevant to the renderer.
    // The renderer recognizes an aux node by having "assocId" data.
    data: {
      assocId: eleId(edge),         // holds original edge ID. Needed by context menu.
      icon: '\uf10c'                // see model.js DEFAULT_TOPIC_ICON
    },
    position: edge.midpoint()
  })
}

/**
 * Auto-position topic if no position is set.
 */
function initPos (viewTopic) {
  // console.log('initPos', viewTopic.id, viewTopic.getViewProp('dmx.topicmaps.x') !== undefined,
  //   state.object && state.object.id)
  if (viewTopic.getViewProp('dmx.topicmaps.x') === undefined) {
    const pos = {}
    if (state.object) {
      // If there is a single selection: place lower/right to the selected topic/assoc
      // TODO: more elaborated placement, e.g. at near free position?
      const p = state.topicmap.getPosition(state.object.id)
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
      id:      viewTopic.id,
      typeUri: viewTopic.typeUri,
      label:   viewTopic.value,
      icon:    viewTopic.getIcon(),
      viewTopic
    },
    position: viewTopic.getPosition()
  }
}

/**
 * Builds a Cytoscape edge from a dm5.ViewAssoc
 *
 * @param   viewAssoc   A dm5.ViewAssoc
 */
function cyEdge (viewAssoc) {
  return {
    data: {
      id:      viewAssoc.id,
      typeUri: viewAssoc.typeUri,
      label:   viewAssoc.value,
      source:  viewAssoc.role1.topicId,
      target:  viewAssoc.role2.topicId,
      viewAssoc
    }
  }
}

/**
 * Gets the Cytoscape element with the given ID. ### TODO: copy in cytoscape-view.js
 *
 * @param   id    a DM object id (number)
 *
 * @return  A collection of 1 or 0 elements. ### TODO: throw if 0?
 */
function cyElement (id) {
  return cyView.cy.getElementById(id.toString())   // Note: a Cytoscape element ID is a string
}

function isSelected (objectId) {
  return state.ele && eleId(state.ele) === objectId
}

// copy in dm5-cytoscape-renderer.vue and dm5-detail-layer.vue
function eleId (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}
