/*
  TODO: architecture; separate topicmap model from renderer
    1. Topicmap controller
      - holds topicmap, e.g. dm5.Topicmap or dm5.Geomap (model)
      - provides update facility; updates all 3 aspects together
        - client state
        - server state
        - view; knows the current renderer
    2. Renderer (view): knows the topicmap model it can render; utilizes specific renderer library
  The same topicmap model can be rendered by different renderers then.
  Examples:
    - the standard topicmap model could be rendered by Cytoscape or by D3
    - the geomap model could be rendered by Leaflet or by OpenLayers
  At the moment both aspects (model updates and view updates) are melted together in this file (while most Cytoscape
  specifics are already factored out as cytoscape-view.js).
  Implementing e.g. a D3 renderer would cause code/structure duplication.
*/

import CytoscapeView from './cytoscape-view'
import Vue from 'vue'
import dm5 from 'dm5'

let cyView          // the CytoscapeView instance, instantiated by "_initCytoscape" action

let ele             // The single selection: a selected Cytoscape element (node or edge). Undefined if there is no
                    // single selection.
                    // The selected element's details are displayed in-map. On unselect the details disappear
                    // (unless pinned).
                    // Note: the host application can visualize multi selections by the means of '_renderAsSelected' and
                    // '_renderAsUnselected' actions. The details of multi selection elements are *not* displayed in-map
                    // (unless pinned). ### TODO: introduce multi-selection state in this component?

let modifiers = {}  // modifier keys

const state = {

  // these 3 properties are always initialized together by the "renderTopicmap" action
  // TODO: must this be reactive state? Would local variables be sufficient?
  topicmap: undefined,            // the rendered topicmap (dm5.Topicmap)
  topicmapWritable: undefined,    // True if the current user has WRITE permission for the rendered topicmap
  selection: undefined,           // the selection model for the rendered topicmap (a Selection object, defined in
                                  // dm5-topicmaps)

  object: undefined,              // the selected object (dm5.DMXObject)
  objectWritable: undefined,      // True if the current user has WRITE permission for the selected object

  details: {},    // In-map details. Detail records keyed by object ID (created by createDetail() and
                  // createDetailForSelection()):
                  //  {
                  //    id        ID of "object" (Number). May be set before "object" is actually available.
                  //    object    The object to render (dm5.Topic, dm5.Assoc)
                  //    node      Getter. The "detail node" (a Cytoscape node). Either "ele" (if "ele" is a node),
                  //              or the "aux node" (if "ele" is an edge). This node is visually styled (border, size).
                  //    pos       The position of the detail DOM.
                  //    size      The size (in pixel) of the detail DOM (object with "width" and "height" props).
                  //              Needed to calculate "pos".
                  //    writable  Getter. True if the current user has WRITE permission for "object" (Boolean)
                  //    pinned    Getter. Whether the detail is pinned or not (Boolean)
                  //  }

  zoom: 1         // TODO: real init value
}

const actions = {

  fetchTopicmap (_, id) {
    // console.log('fetchTopicmap', id, '(topicmap-model)')
    return dm5.restClient.getTopicmap(id)
  },

  /**
   * @returns   a promise resolved once topicmap rendering is complete.
   */
  renderTopicmap (_, {topicmap, writable, selection}) {
    // console.log('renderTopicmap', topicmap.id)
    ele = undefined
    state.topicmap = topicmap
    state.topicmapWritable = writable
    state.selection = selection
    state.details = {}
    return cyView.renderTopicmap(topicmap, selection).then(showPinnedDetails)
  },

  // TODO: rename "reveal" functions to "show"/"render"?

  /**
   * Reveals a topic on the topicmap panel.
   *
   * @param   topic   the topic to reveal (dm5.Topic).
   * @param   pos     Optional: the topic position in model coordinates (object with "x", "y" props).
   *                  If not given it's up to the topicmap renderer to position the topic.
   * @param   select  Optional: if trueish the revealed topic is selected programmatically.
   */
  revealTopic ({dispatch}, {topic, pos, select}) {
    // update state + view
    const op = _revealTopic(topic, pos, select, dispatch)
    // update server
    if (state.topicmapWritable) {
      if (op.type === 'add') {
        dm5.restClient.addTopicToTopicmap(state.topicmap.id, topic.id, op.viewTopic.viewProps)
      } else if (op.type === 'show') {
        dm5.restClient.setTopicVisibility(state.topicmap.id, topic.id, true)
      }
    }
  },

  revealAssoc ({dispatch}, {assoc, select}) {
    // update state + view
    const op = _revealAssoc(assoc, select, dispatch)
    // update server
    if (state.topicmapWritable) {
      if (op.type === 'add') {
        dm5.restClient.addAssocToTopicmap(state.topicmap.id, assoc.id, op.viewAssoc.viewProps)
      } else if (op.type === 'show') {
        dm5.restClient.setAssocVisibility(state.topicmap.id, assoc.id, true)
      }
    }
  },

  revealRelatedTopic ({dispatch}, {relTopic, select}) {
    // update state + view
    const topicOp = _revealTopic(relTopic, undefined, select, dispatch)      // pos=undefined
    const assocOp = _revealAssoc(relTopic.assoc,      false,  dispatch)      // select=false
    // console.log('revealRelatedTopic', topicOp, assocOp)
    // update server
    if (state.topicmapWritable) {
      if (assocOp.type) {
        // Note: the case the topic is revealed but not the assoc can't happen
        // Note: if the topic is not revealed (but the assoc is) topicOp.viewTopic is undefined
        const viewProps = topicOp.viewTopic && topicOp.viewTopic.viewProps
        dm5.restClient.addRelatedTopicToTopicmap(state.topicmap.id, relTopic.id, relTopic.assoc.id, viewProps)
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
    // update view (up-to-date already)
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
    // console.log('setTopicPositions', coords)
    // update state
    coords.forEach(coord =>
      state.topicmap.getTopic(coord.topicId).setPosition({
        x: coord.x,
        y: coord.y
      })
    )
    // update view (up-to-date already)
    // update server
    if (state.topicmapWritable) {
      dm5.restClient.setTopicPositions(state.topicmap.id, coords)
    }
  },

  // TODO: move update-server aspect to main application? Move this action to webclient.js?
  hideMulti ({dispatch}, idLists) {
    // console.log('hideMulti', idLists.topicIds, idLists.assocIds)
    // update state + view (for immediate visual feedback)
    idLists.topicIds.forEach(id => dispatch('_hideTopic', id))
    idLists.assocIds.forEach(id => dispatch('_hideAssoc', id))
    // update server
    if (state.topicmapWritable) {
      dm5.restClient.hideMulti(state.topicmap.id, idLists)
    }
  },

  setTopicPinned (_, {topicId, pinned}) {
    console.log('setTopicPinned', topicId, pinned)
    // update state + view
    _setTopicPinned(topicId, pinned)
    // update server
    dm5.restClient.setTopicViewProps(state.topicmap.id, topicId, {    // FIXME: check topicmapWritable?
      'dmx.topicmaps.pinned': pinned
    })
  },

  setAssocPinned (_, {assocId, pinned}) {
    console.log('setAssocPinned', assocId, pinned)
    // update state + view
    _setAssocPinned(assocId, pinned)
    // update server
    dm5.restClient.setAssocViewProps(state.topicmap.id, assocId, {    // FIXME: check topicmapWritable?
      'dmx.topicmaps.pinned': pinned
    })
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single topic.
   * Hiding is always performed as a multi-operation, that is in a single request.
   */
  _hideTopic ({dispatch}, id) {
    unpinTopicIfPinned(id, dispatch)
    // update state
    state.topicmap.hideAssocsWithPlayer(id)
    state.topicmap.getTopic(id).setVisibility(false)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single assoc.
   * Hiding is always performed as a multi-operation, that is in a single request.
   */
  _hideAssoc ({dispatch}, id) {
    const assoc = state.topicmap.getAssoc(id)
    // If the assoc is already hidden nothing is performed. This can happen while hide-multi.
    if (!assoc.isVisible()) {
      return
    }
    //
    unpinAssocIfPinned(id, dispatch)
    // update state
    state.topicmap.hideAssocsWithPlayer(id)
    assoc.setVisibility(false)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by deleteMulti() high-level action (see dm4-webclient/webclient.js).
   *
   * Note: there is no high-level action to delete a single topic.
   * Deleting is always performed as a multi-operation, that is in a single request.
   */
  _deleteTopic (_, id) {
    _unpinTopicIfPinned(id)
    // update state
    state.topicmap.removeAssocsWithPlayer(id)
    state.topicmap.removeTopic(id)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by deleteMulti() high-level action (see dm4-webclient/webclient.js).
   *
   * Note: there is no high-level action to delete a single assoc.
   * Deleting is always performed as a multi-operation, that is in a single request.
   */
  _deleteAssoc (_, id) {
    // If the assoc is already deleted nothing is performed. This can happen while delete-multi.
    if (!state.topicmap.hasAssoc(id)) {
      return
    }
    //
    _unpinAssocIfPinned(id)
    // update state
    state.topicmap.removeAssocsWithPlayer(id)
    state.topicmap.removeAssoc(id)
    // update view
    cyView.remove(id)
  },

  // WebSocket messages

  _addTopicToTopicmap (_, {topicmapId, viewTopic}) {
    if (topicmapId === state.topicmap.id) {
      const _viewTopic = new dm5.ViewTopic(viewTopic)
      state.topicmap.addTopic(_viewTopic)                                 // update state
      cyView.addTopic(_viewTopic)                                         // update view
    }
  },

  _addAssocToTopicmap (_, {topicmapId, viewAssoc}) {
    if (topicmapId === state.topicmap.id) {
      const _viewAssoc = new dm5.ViewAssoc(viewAssoc)
      state.topicmap.addAssoc(_viewAssoc)                                 // update state
      cyView.addAssoc(_viewAssoc)                                         // update view
    }
  },

  _setTopicPosition (_, {topicmapId, topicId, pos}) {
    if (topicmapId === state.topicmap.id) {
      const viewTopic = state.topicmap.getTopic(topicId)
      viewTopic.setPosition(pos)                                          // update state
      if (viewTopic.isVisible()) {
        cyView.updateTopicPos(topicId, pos)                               // update view
      }
    }
  },

  _setTopicVisibility (_, {topicmapId, topicId, visibility}) {
    // console.log('_setTopicVisibility (Cytoscape Renderer)')
    if (topicmapId === state.topicmap.id) {
      const viewTopic = state.topicmap.getTopic(topicId)
      viewTopic.setVisibility(visibility)                                 // update state
      if (visibility) {
        cyView.addTopic(viewTopic)                                        // update view
      } else {
        state.topicmap.hideAssocsWithPlayer(topicId)                      // update state
        cyView.remove(topicId)                                            // update view
      }
    }
  },

  _setAssocVisibility (_, {topicmapId, assocId, visibility}) {
    // console.log('_setAssocVisibility (Cytoscape Renderer)')
    if (topicmapId === state.topicmap.id) {
      const viewAssoc = state.topicmap.getAssoc(assocId)
      viewAssoc.setVisibility(visibility)                                 // update state
      if (visibility) {
        cyView.addAssoc(viewAssoc)                                        // update view
      } else {
        state.topicmap.hideAssocsWithPlayer(assocId)                      // update state
        cyView.remove(assocId)                                            // update view
      }
    }
  },

  _processDirectives (_, directives) {
    // console.log(`Cytoscape Renderer: processing ${directives.length} directives`)
    directives.forEach(dir => {
      switch (dir.type) {
      case "UPDATE_TOPIC":
        const topic = new dm5.Topic(dir.arg)
        updateTopic(topic)
        updateDetail(topic)
        break
      case "DELETE_TOPIC":
        deleteTopic(dir.arg)
        break
      case "UPDATE_ASSOCIATION":
        const assoc = new dm5.Assoc(dir.arg)
        updateAssoc(assoc)
        updateDetail(assoc)
        break
      case "DELETE_ASSOCIATION":
        deleteAssoc(dir.arg)
        break
      case "UPDATE_TOPIC_TYPE":
        updateTopicIcons(dir.arg.uri)
        break
      case "UPDATE_ASSOCIATION_TYPE":
        updateAssocColors(dir.arg.uri)
        break
      }
    })
  },

  // === Cytoscape View ===

  // Module internal actions (dispatched from dm5-cytoscape-renderer components or cytoscape-view.js)

  /**
   * @param   container   the container DOM element for the Cytoscape instance
   * @param   parent      the dm5-topicmap-panel (a Vue instance)
   * @param   box         the DOM element used for measurement
   */
  _initCytoscape ({dispatch}, {container, contextCommands, parent, box}) {
    // console.log('_initCytoscape')
    cyView = new CytoscapeView(container, contextCommands, parent, box, modifiers, dispatch)
  },

  _syncObject (_, object) {
    // console.log('_syncObject', object)
    state.object = object
  },

  _syncWritable (_, writable) {
    state.objectWritable = writable
  },

  _syncDetailSize: dm5.utils.debounce((_, id) => {
    // console.log('_syncDetailSize', id)
    // Note: at the time assoc parts arrive the detail size needs to be adjusted.
    // If the assoc is unselected meanwhile the detail record does not exist anymore.
    const detail = _detail(id)
    if (!detail) {
      console.warn(`adjustDetailSize() when detail ${id} is undefined`)
    }
    detail && adjustDetailSize(detail)
  }, 300),

  _syncPan (_, pan) {
    // console.log('_syncPan', pan)
    updateAllDetailPos()
  },

  _syncZoom (_, zoom) {
    // console.log('_syncZoom', zoom)
    state.zoom = zoom
  },

  _setModifiers (_, _modifiers) {
    modifiers.alt = _modifiers.alt
  },

  // Cross-Module

  /**
   * Renders a topic/assoc as selected, and the previously selected one as unselected, if any.
   * Shows in-map details and plays the fisheye animation.
   *
   * Precondition:
   * - the topicmap rendering is complete
   *
   * Postcondition:
   * - "ele" state is up-to-date
   *
   * @param   id
   *            id of the topic/assoc to render as selected
   * @param   p
   *            a promise resolved once topic/assoc data has arrived (global "object" state is up-to-date).
   *            Note: the detail's size can only be measured once "object" details are rendered.
   * @param   showDetails
   *            whether to show topic/assoc in-map details (Boolean)
   */
  renderAsSelected (_, {id, p, showDetails}) {
    // console.log('renderAsSelected', id, showDetails)
    // Note: if selectById() throws we don't want create the promise. Otherwise we would get 2 error messages instead of
    // one due to nested promises. renderAsSelected() runs itself in a promise executor function (before an object can
    // be rendered as selected the topicmap rendering must be complete).
    const _ele = cyView.selectById(id)     // selectById() restores selection after switching topicmap
    // Note: programmatic unselect() is required for browser history navigation. If *interactively* selecting a node
    // Cytoscape removes the current selection before. In contrast if *programmatically* selecting a node Cytoscape does
    // *not* remove the current selection.
    const p2 = ele && unselectElement()
    // Note: the fisheye animation can only be started once the restore animation is complete, *and* "object" is
    // available. The actual order of these 2 occasions doesn't matter.
    showDetails && Promise.all([p, p2]).then(createAndShowSelectionDetail)
    //
    ele = _ele
  },

  renderAsUnselected () {
    // console.log('renderAsUnselected')
    const p = unselectElement()
    p && p.then(playFisheyeAnimationIfDetailsOnscreen)
    ele = undefined
  },

  /**
   * Renders an element as selected without displaying the element's details.
   * Called by host application to visualize a multi selection.
   *
   * @throws  if this component is in single selection state.
   */
  _renderAsSelected (_, id) {
    // console.log('_renderAsSelected', id)
    if (ele) {
      throw Error(`_renderAsSelected(${id}) when "ele" is set (${eleId(ele)})`)
    }
    cyView.selectById(id)
  },

  /**
   * Renders an element as unselected without removing the element's details (and without playing the restore
   * animation). Called by host application to visually remove a multi selection (e.g. after a route switch).
   *
   * @throws  if this component is not in single selection state.
   */
  _renderAsUnselected (_, id) {
    // console.log('_renderAsUnselected', id)
    if (!ele) {
      throw Error(`_renderAsUnselected(${id}) when "ele" is not set`)
    }
    cyView.unselectById(id)
  },

  _removeDetail () {
    removeSelectionDetail()
  },

  resizeTopicmapRenderer () {
    // console.log('resizeTopicmapRenderer')
    cyView.resize()
  }
}

const getters = {

  visibleTopicIds (state) {
    // Note: at startup state.topicmap is undefined
    // console.log('visibleTopicIds getter', state.topicmap)
    return state.topicmap && state.topicmap.topics.filter(topic => topic.isVisible()).map(topic => topic.id)
  },

  visibleAssocIds (state) {
    // console.log('visibleAssocIds getter', state.topicmap)
    return state.topicmap && state.topicmap.assocs.map(assoc => assoc.id)
  }
}

export default {
  state,
  actions,
  getters
}

// === DMX Model ===

// Update state + view

/**
 * @param   topic   the topic to reveal (dm5.Topic).
 * @param   pos     Optional: the topic position in model coordinates (object with "x", "y" props).
 *                  If not given it's up to the topicmap renderer to position the topic.
 * @param   select  Optional: if trueish the revealed topic is selected programmatically.
 */
function _revealTopic (topic, pos, select, dispatch) {
  // update state
  const op = state.topicmap.revealTopic(topic, pos)
  // update view
  if (op.type === 'add' || op.type === 'show') {
    cyView.addTopic(initPos(op.viewTopic))
  }
  select && dispatch('callTopicRoute', topic.id)     // TODO: don't dispatch into host application
  return op
}

function _revealAssoc (assoc, select, dispatch) {
  // update state
  const op = state.topicmap.revealAssoc(assoc)
  // update view
  if (op.type === 'add' || op.type === 'show') {
    cyView.addAssoc(op.viewAssoc)
  }
  select && dispatch('callAssocRoute', assoc.id)     // TODO: don't dispatch into host application
  return op
}

function _setTopicPinned (topicId, pinned) {
  // update state
  state.topicmap.getTopic(topicId).setPinned(pinned)
  // update view
  _syncPinned(topicId, pinned)
}

function _setAssocPinned (assocId, pinned) {
  // update state
  state.topicmap.getAssoc(assocId).setPinned(pinned)
  // update view
  _syncPinned(assocId, pinned)
}

// Process directives

/**
 * Processes an UPDATE_TOPIC directive.
 */
function updateTopic (topic) {
  // console.log('updateTopic', topic)
  const viewTopic = state.topicmap.getTopicIfExists(topic.id)
  if (viewTopic) {
    // update state
    viewTopic.value = topic.value
    // update view
    if (viewTopic.isVisible()) {
      cyView.updateTopic(topic.id, {
        label: topic.value
      })
    }
  }
}

/**
 * Processes an UPDATE_ASSOCIATION directive.
 */
function updateAssoc (assoc) {
  const viewAssoc = state.topicmap.getAssocIfExists(assoc.id)
  if (viewAssoc) {
    // update state
    viewAssoc.value = assoc.value
    viewAssoc.typeUri = assoc.typeUri
    // update view
    cyView.updateAssoc(assoc.id, {
      label: assoc.value,
      color: assoc.color
    })
  }
}

/**
 * Processes a DELETE_TOPIC directive.
 */
function deleteTopic (topic) {
  // FIXME: remove topic from *all* topicmaps
  const viewTopic = state.topicmap.getTopicIfExists(topic.id)
  if (viewTopic) {
    // Note: state.topicmap.removeAssocsWithPlayer() is not called here (compare to _deleteTopic() action above).
    // The assocs will be removed while processing the DELETE_ASSOCIATION directives as received along with the
    // DELETE_TOPIC directive.
    //
    // update state
    state.topicmap.removeTopic(topic.id)
    // update view
    if (viewTopic.isVisible()) {
      cyView.remove(topic.id)
    }
  }
}

/**
 * Processes a DELETE_ASSOCIATION directive.
 */
function deleteAssoc (assoc) {
  // FIXME: remove assoc from *all* topicmaps
  const viewAssoc = state.topicmap.getAssocIfExists(assoc.id)
  if (viewAssoc) {
    // FIXME: remove assocs with player as well?
    //
    // update state
    state.topicmap.removeAssoc(assoc.id)
    // update view
    cyView.remove(assoc.id)
  }
}

/**
 * Processes an UPDATE_TOPIC_TYPE directive.
 */
function updateTopicIcons (typeUri) {
  state.topicmap.topics
    .filter(topic => topic.typeUri === typeUri)
    .filter(topic => topic.isVisible())
    .forEach(topic => {
      // Note: no state update here. Topic icon is not part of ViewTopic but computed based on type definition.
      // Type cache is up-to-date already. De-facto the Type Cache processes directives *before* Topicmap Model
      // processes directives.
      //
      // update view
      cyView.updateTopic(topic.id, {
        icon: topic.icon
      })
    })
}

/**
 * Processes an UPDATE_ASSOCIATION_TYPE directive.
 */
function updateAssocColors (typeUri) {
  state.topicmap.assocs.filter(assoc => assoc.typeUri === typeUri).forEach(assoc => {
    // Note: no state update here. Assoc color is not part of ViewAssoc but computed based on type definition.
    // Type cache is up-to-date already. De-facto the Type Cache processes directives *before* Topicmap Model
    // processes directives.
    //
    // update view
    cyView.updateAssoc(assoc.id, {
      color: assoc.color
    })
  })
}

// Pinning

function unpinTopicIfPinned (id, dispatch) {
  if (state.topicmap.getTopic(id).isPinned()) {
    // TODO: don't send request. Make unpin implicit to hide at server-side.
    dispatch('setTopicPinned', {topicId: id, pinned: false})      // update state + view + server
  }
}

function unpinAssocIfPinned (id, dispatch) {
  if (state.topicmap.getAssoc(id).isPinned()) {
    // TODO: don't send request. Make unpin implicit to hide at server-side.
    dispatch('setAssocPinned', {assocId: id, pinned: false})      // update state + view + server
  }
}

function _unpinTopicIfPinned (id) {
  if (state.topicmap.getTopic(id).isPinned()) {
    _setTopicPinned(id, false)                                    // update state + view
  }
}

function _unpinAssocIfPinned (id) {
  if (state.topicmap.getAssoc(id).isPinned()) {
    _setAssocPinned(id, false)                                    // update state + view
  }
}

// Helper

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
      pos.x = p.x + 60
      pos.y = p.y + 120
    } else {
      pos.x = 200
      pos.y = 240
    }
    viewTopic.setPosition(pos)
  }
  return viewTopic
}

// === Cytoscape View ===

/**
 * Unselects the selected element, removes the corresponding detail from screen (if not pinned), and plays the restore
 * animation.
 *
 * Precondition:
 * - an element is selected
 *
 * @return  if the restore animation is played: a promise resolved once the animation is complete, otherwise undefined
 */
function unselectElement () {
  // console.log('unselectElement', ele && eleId(ele))
  if (!ele) {
    throw Error('unselectElement() when no element is selected')
  }
  // console.log('unselectElement', eleId(ele), cyView.cy.elements(":selected").size())
  // Note 1: when the user clicks on the background Cytoscape unselects the selected element on its own.
  // Calling cy.elements(":selected") afterwards would return an empty collection.
  // This is why we maintain an explicit "ele" state.
  // Note 2: unselect() removes the element's selection style when manually stripping topic/assoc from
  // browser URL. In this situation cy.elements(":selected") would return a non-empty collection.
  cyView.unselect(ele)
  //
  return removeSelectionDetail()
}

/**
 * Removes the detail representing the selection from screen (if not pinned), and plays the restore animation.
 * If no such detail is displayed (or if it is pinned) nothing is performed (in particular no animation is played).
 *
 * Precondition:
 * - an element is selected
 *
 * @return  if the restore animation is played: a promise resolved once the animation is complete, otherwise undefined
 */
function removeSelectionDetail () {
  const detail = selectionDetail()
  // Note: the detail record might be removed meanwhile due to async operation (TODO: why excatly?)
  if (!detail) {
    // Note: this is expected behavior if in-map detail are not shown. To avoid this condition more complex state
    // management would be required (in the app's router), in particular in the event of detail panel opening/closing.
    // console.warn(`removeDetail() when detail ${ele.id()} is undefined`)
  }
  return detail && !detail.pinned && removeDetail(detail)
}

/**
 * Looks up the detail record for the selection.
 *
 * Precondition:
 * - an element is selected
 *
 * @return    may undefined
 */
function selectionDetail () {
  if (!ele) {
    throw Error('selectionDetail() when nothing is selected')
  }
  return _detail(eleId(ele))
}

/**
 * @return  a promise resolved once the animation is complete.
 */
function playRestoreAnimation () {
  // console.log('starting restore animation')
  return Promise.all(state.topicmap.topics
    .filter(viewTopic => viewTopic.isVisible())
    .map(viewTopic => cyView.updateTopicPos(viewTopic.id, viewTopic.getPosition()))
  )
}

function _syncPinned (id, pinned) {
  // console.log('_syncPinned', id, pinned)
  if (!pinned && !isSelected(id)) {
    removeDetail(detail(id)).then(playFisheyeAnimationIfDetailsOnscreen)
  }
}

function detail (id) {
  const detail = _detail(id)
  if (!detail) {
    throw Error(`detail record ${id} not found`)
  }
  return detail
}

function _detail (id) {
  return state.details[id]
}

// Details

function showPinnedDetails () {
  state.topicmap.topics
    .filter(viewTopic => viewTopic.isPinned() && viewTopic.isVisible())
    .forEach(viewTopic => createDetail(viewTopic).then(showDetail))
  state.topicmap.assocs
    .filter(viewAssoc => viewAssoc.isPinned())
    .forEach(viewAssoc => createDetail(viewAssoc).then(showDetail))
  return state.topicmap
}

/**
 * Creates a detail record for the given object.
 *
 * @param   viewObject    a dm5.ViewTopic or a dm5.ViewAssoc
 */
function createDetail (viewObject) {
  const id = viewObject.id
  const node = cyView.detailNode(id)
  const detail = {
    id,
    object: undefined,
    pos: node.renderedPosition(),
    size: undefined,
    writable: undefined,
    get node () {           // Note: Cytoscape objects must not be used as Vue.js state.
      return node           // By using a getter (instead a prop) the object is not made reactive.
    },
    // Note: a property would not be reactive. With a getter it works.
    get pinned () {
      return viewObject.isPinned()
    }
  }
  listenPosition(detail)
  return new Promise(resolve => {
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
 * - "ele" is up-to-date
 * - "object" state is up-to-date
 *
 * @return  the created detail record
 */
function createDetailForSelection () {
  // console.log('createDetailForSelection', state.object)
  const id = eleId(ele)
  const node = cyView.detailNode(id)
  let viewObject
  if (ele.isNode()) {
    viewObject = state.topicmap.getTopic(id)
  } else {
    viewObject = state.topicmap.getAssoc(id)
    cyView.select(node)     // select aux node along with assoc
  }
  const detail = {
    id,
    object: state.object,
    pos: node.renderedPosition(),
    size: undefined,
    get node () {           // Note: Cytoscape objects must not be used as Vue.js state.
      return node           // By using a getter (instead a prop) the object is not made reactive.
    },
    // Note: properties would not be reactive. With getters it works.
    get writable () {
      return state.objectWritable
    },
    get pinned () {
      return viewObject.isPinned()
    }
  }
  listenPosition(detail)
  return detail
}

function showDetail (detail) {
  detail.node.addClass('expanded')
  Vue.set(state.details, detail.id, detail)       // Vue.set() triggers dm5-detail-layer rendering
  Vue.nextTick(() => {
    adjustDetailSize(detail)
  })
}

function createAndShowSelectionDetail () {
  !ele && console.warn('createDetailForSelection() when "ele" is undefined')
  ele && showDetail(createDetailForSelection())
}

/**
 * Measures the size of the given detail, resizes the detail node accordingly, and plays the fisheye animation.
 *
 * Precondition:
 * - the DOM is updated already.
 *
 * @param   detail    a detail record
 */
function adjustDetailSize(detail) {
  const detailDOM = document.querySelector(`.dm5-detail-layer .dm5-detail[data-detail-id="${detail.id}"]`)
  if (!detailDOM) {
    throw Error(`detail DOM ${detail.id} not found`)
  }
  detail.size = {   // FIXME: use Vue.set()?
    width:  detailDOM.clientWidth,
    height: detailDOM.clientHeight
  }
  // console.log('adjustDetailSize', detail.node.id(), detail.size.width, detail.size.height)
  detail.node.style(detail.size)
  cyView.playFisheyeAnimation()
}

/**
 * Removes the given detail from screen and plays the restore animation.
 *
 * @return  a promise resolved once the restore animation is complete.
 */
function removeDetail (detail) {
  // console.log('removeDetail', detail.id)
  detail.node.off('position')                       // FIXME: do not unregister *all* position handlers?
  // update state
  Vue.delete(state.details, detail.id)              // Vue.delete() triggers dm5-detail-layer rendering
  // update view
  detail.node.removeClass('expanded')
  detail.node.style({width: null, height: null})    // reset size
  return playRestoreAnimation()
}

function updateDetail (object) {
  const detail = Object.values(state.details).find(detail => detail.id === object.id)
  if (detail) {
    detail.object = object.isType() ? object.asType() : object    // logical copy in createDetail()
  }
}

function updateAllDetailPos () {
  Object.values(state.details).forEach(updateDetailPos)
}

function listenPosition (detail) {
  detail.node.on('position', () => {
    updateDetailPos(detail)
  })
}

function updateDetailPos (detail) {
  detail.pos = detail.node.renderedPosition()
}

function playFisheyeAnimationIfDetailsOnscreen () {
  if (!dm5.utils.isEmpty(state.details)) {
    cyView.playFisheyeAnimation()
  }
}

// Helper

function isSelected (objectId) {
  return ele && eleId(ele) === objectId
}

// copy in dm5-cytoscape-renderer.vue
// copy in dm5-detail-layer.vue
// copy in cytoscape-edge-connections (index.js)
function eleId (ele) {
  // Note: Cytoscape element IDs are strings
  return Number(ele.id())
}
