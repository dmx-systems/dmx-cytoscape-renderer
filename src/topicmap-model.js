/*
  TODO: architecture; separate topicmap model from renderer
    1. Topicmap controller
      - holds topicmap, e.g. dmx.Topicmap or Geomap (model)
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
import dmx from 'dmx-api'

const AUTO_LAYOUT = false

// auto positioning
const POS_DX = -60
const POS_DY = 120
const POS_X = 200
const POS_Y = 240

// These 2 variables + state.selection are initialized together by "renderTopicmap" action.
let _topicmap           // the rendered topicmap (dmx.Topicmap)
let _topicmapWritable   // true if the current user has WRITE permission for the rendered topicmap (boolean)

let _object             // the selected object (dmx.DMXObject)

let cyView              // The CytoscapeView instance, initialized by "_initCytoscape" action.
                        // The instance lives as long as the Cytoscape Renderer is active. That is when switching
                        // between topicmaps the same instance is (re)used. Only when switching from the Geomap Renderer
                        // to the Cytoscape Renderer a new instance is created.

let ele                 // The single selection: a selected Cytoscape element (node or edge). Undefined if there is no
                        // single selection.
                        // The selected element's details are displayed in-map. On unselect the details disappear
                        // (unless pinned).
                        // Note: the host application can visualize multi selections by the means of '_renderAsSelected'
                        // and '_renderAsUnselected' actions. The details of multi selection elements are *not*
                        // displayed in-map (unless pinned).
                        // ### TODO: introduce multi-selection state in this component?

const modifiers = {}    // modifier keys

const state = {

  objectWritable: undefined,      // True if the current user has WRITE permission for the selected object (boolean).
                                  // Note: the "writable" prop of the selected object's detail record updates
                                  // reactively. "_object" and "objectWritable" update together, but asynchronously.
  selection: undefined,           // The selection model for the rendered topicmap (a Selection object, defined in
                                  // dmx-topicmaps). Initialized together with _topicmap and _topicmapWritable by
                                  // "renderTopicmap" action.
                                  // Note: dmx-detail component style updates reactively.
  zoom: undefined,                // Note: dmx-detail component style updates reactively.
  activeId: -1,                   // ID of active topic, -1 if no one
                                  // Note: dmx-detail component style updates reactively.

  details: {}     // In-map details. Detail records keyed by object ID (created by createDetail() and
                  // createDetailForSelection()):     ### FIXDOC
                  //  {
                  //    id        ID of "object" (Number). May be set before "object" is actually available.
                  //    object    The object to render (dmx.Topic, dmx.Assoc)
                  //    node      Getter. The "detail node" (a Cytoscape node). Either "ele" (if "ele" is a node),
                  //              or the "aux node" (if "ele" is an edge). This node is visually styled (border, size).
                  //    pos       The position of the detail DOM.
                  //    size      The size (in pixel) of the detail DOM (object with "width" and "height" props).
                  //              Needed to calculate "pos".
                  //    writable  Getter. True if the current user has WRITE permission for "object" (boolean)
                  //    pinned    Getter. Whether the detail is pinned (boolean)
                  //  }
}

const actions = {

  // Topicmap Panel protocol

  fetchTopicmap (_, id) {
    return dmx.rpc.getTopicmap(id)
  },

  fetchTopicmapAppendix ({rootState, dispatch}, topicmap) {
    // implicit read permission for 1) topic types, 2) assoc types, and 3) role types
    const p = []
    const topicTypeUris = []
    const assocTypeUris = []
    const roleTypeUris = []
    topicmap.topics.forEach(topic => {
      if (!rootState.typeCache.topicTypes[topic.typeUri] && !topicTypeUris.includes(topic.typeUri)) {
        topicTypeUris.push(topic.typeUri)
        p.push(dmx.rpc.getTopicTypeImplicitly(topic.id).then(topicType => dispatch('putTopicType', topicType)))
      }
    })
    topicmap.assocs.forEach(assoc => {
      if (!rootState.typeCache.assocTypes[assoc.typeUri] && !assocTypeUris.includes(assoc.typeUri)) {
        assocTypeUris.push(assoc.typeUri)
        p.push(dmx.rpc.getAssocTypeImplicitly(assoc.id).then(assocType => dispatch('putAssocType', assocType)))
      }
      const uri1 = assoc.player1.roleTypeUri
      if (!rootState.typeCache.roleTypes[uri1] && !roleTypeUris.includes(uri1)) {
        roleTypeUris.push(uri1)
        p.push(dmx.rpc.getRoleTypeImplicitly(assoc.id, uri1).then(roleType => dispatch('putRoleType', roleType)))
      }
      const uri2 = assoc.player2.roleTypeUri
      if (!rootState.typeCache.roleTypes[uri2] && !roleTypeUris.includes(uri2)) {
        roleTypeUris.push(uri2)
        p.push(dmx.rpc.getRoleTypeImplicitly(assoc.id, uri2).then(roleType => dispatch('putRoleType', roleType)))
      }
    })
    return Promise.all(p)
  },

  /**
   * @returns   a promise resolved once topicmap rendering is complete.
   */
  renderTopicmap (_, {topicmap, writable, selection}) {
    _topicmap = topicmap
    _topicmapWritable = writable
    ele = undefined
    state.selection = selection
    state.zoom = topicmap.zoom
    state.details = {}
    return cyView.renderTopicmap(topicmap, writable, selection).then(showPinnedDetails)
  },

  // On logout, before the type cache is diminished, we remove in-map details from screen
  // to avoid render errors due to missing types.
  clearTopicmap () {
    state.details = {}
  },

  // Topicmap type specific actions

  /**
   * Reveals a topic on the topicmap panel.
   *
   * @param   topic   the topic to reveal (dmx.Topic).
   * @param   pos     Optional: the topic position in model coordinates (object with "x", "y" props).
   *                  If not given it's up to the topicmap renderer to position the topic.
   */
  renderTopic (_, {topic, pos, autoPan}) {
    // update state + view
    const op = _revealTopic(topic, pos, autoPan)
    autoRevealAssocs(topic.id)
    // update server
    if (_topicmapWritable) {
      if (op.type === 'add') {
        dmx.rpc.addTopicToTopicmap(_topicmap.id, topic.id, op.viewTopic.viewProps)
      } else if (op.type === 'show') {
        dmx.rpc.setTopicVisibility(_topicmap.id, topic.id, true)
      }
    }
  },

  renderAssoc (_, assoc) {
    // update state + view
    const op = _revealAssoc(assoc)
    // FIXME: auto-assoc-reveal for assocs?
    // update server
    if (_topicmapWritable) {
      if (op.type === 'add') {
        dmx.rpc.addAssocToTopicmap(_topicmap.id, assoc.id, op.viewAssoc.viewProps)
      } else if (op.type === 'show') {
        // Note: actually never called by DMX webclient. The "renderAssoc" action is only called after assoc creation;
        // In this case op.type is always "add". In most cases assocs are revealed through "renderRelatedTopic" action.
        dmx.rpc.setAssocVisibility(_topicmap.id, assoc.id, true)
      }
    }
  },

  renderRelatedTopic (_, {relTopic, pos, autoPan}) {
    // update state + view
    const topicOp = _revealTopic(relTopic, pos, autoPan)
    const assocOp = _revealAssoc(relTopic.assoc)
    autoRevealAssocs(relTopic.id)
    // update server
    if (_topicmapWritable) {
      if (assocOp.type) {
        // Note: the case the topic is revealed but not the assoc can't happen
        // Note: if the topic is not revealed (but the assoc is) topicOp.viewTopic is undefined
        const viewProps = topicOp.viewTopic && topicOp.viewTopic.viewProps
        dmx.rpc.addRelatedTopicToTopicmap(_topicmap.id, relTopic.id, relTopic.assoc.id, viewProps)
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
    // update state
    _topicmap.getTopic(id).setPosition(pos)
    // update view (up-to-date already)
    // update server
    if (_topicmapWritable) {
      dmx.rpc.setTopicPosition(_topicmap.id, id, pos)
    }
  },

  /**
   * Preconditions:
   * - the topics belong to the selected topicmap
   * - the view is up-to-date
   * - the server is *not* yet up-to-date
   *
   * @param   topicCoords    array of 3-prop objects: 'topicId', 'x', 'y'
   */
  setTopicPositions (_, topicCoords) {
    // update state
    topicCoords.forEach(coord =>
      _topicmap.getTopic(coord.topicId).setPosition({
        x: coord.x,
        y: coord.y
      })
    )
    // update view (up-to-date already)
    // update server
    if (_topicmapWritable) {
      dmx.rpc.setTopicPositions(_topicmap.id, topicCoords)
    }
  },

  // TODO: move update-server aspect to main application? Move this action to webclient.js?
  hideMulti ({dispatch}, idLists) {
    // update state + view (for immediate visual feedback)
    idLists.topicIds.forEach(id => dispatch('_hideTopic', id))
    idLists.assocIds.forEach(id => dispatch('_hideAssoc', id))
    // update server
    if (_topicmapWritable) {
      dmx.rpc.hideMulti(_topicmap.id, idLists)
    }
  },

  setTopicPinned (_, {topicId, pinned, showDetails}) {
    // update state
    _topicmap.getTopic(topicId).setPinned(pinned)
    // update view
    removeDetailIfUnpinned(topicId, pinned, showDetails)
    // update server
    if (_topicmapWritable) {
      dmx.rpc.setTopicViewProps(_topicmap.id, topicId, {
        'dmx.topicmaps.pinned': pinned
      })
    }
  },

  setAssocPinned (_, {assocId, pinned, showDetails}) {
    // update state
    _topicmap.getAssoc(assocId).setPinned(pinned)
    // update view
    removeDetailIfUnpinned(assocId, pinned, showDetails)
    // update server
    if (_topicmapWritable) {
      dmx.rpc.setAssocViewProps(_topicmap.id, assocId, {
        'dmx.topicmaps.pinned': pinned
      })
    }
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single topic.
   * Hiding is always performed as a multi-operation, that is in a single request.
   */
  _hideTopic (_, id) {
    // update state
    hideAssocsWithPlayer(id)
    _topicmap.getTopic(id).setVisibility(false)
    _removeDetailIfOnscreen(id)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by hideMulti() high-level action (see above).
   *
   * Note: there is no high-level action to hide a single assoc.
   * Hiding is always performed as a multi-operation, that is in a single request.
   *
   * Note: its the same code as _deleteAssoc().
   */
  _hideAssoc (_, id) {
    // Note: idempotence is needed for hide-multi
    if (!_topicmap.hasAssoc(id)) {
      return
    }
    // update state
    removeAssocsWithPlayer(id)    // Note: topicmap contexts of *explicitly* hidden assocs are removed
    _topicmap.removeAssoc(id)     // Note: topicmap contexts of *explicitly* hidden assocs are removed
    _removeDetailIfOnscreen(id)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view when a topic is about to be deleted.
   * The caller is responsible for updating the server state.
   *
   * Note: there is no universal high-level action to delete a single topic.
   * This is to realize a delete-multi operation as a single request.
   */
  _deleteTopic (_, id) {
    // update state
    removeAssocsWithPlayer(id)
    _topicmap.removeTopic(id)
    _removeDetailIfOnscreen(id)
    // update view
    cyView.remove(id)
  },

  /**
   * Low-level action that updates client state and view.
   * Server state is *not* updated as done by deleteMulti() high-level action (see webclient.js of module
   * dmx-webclient).
   *
   * Note: there is no high-level action to delete a single assoc.
   * Deleting is always performed as a multi-operation, that is in a single request.
   *
   * Note: its the same code as _hideAssoc().
   */
  _deleteAssoc (_, id) {
    // Note: idempotence is needed for delete-multi
    if (!_topicmap.hasAssoc(id)) {
      return
    }
    // update state
    removeAssocsWithPlayer(id)
    _topicmap.removeAssoc(id)
    _removeDetailIfOnscreen(id)
    // update view
    cyView.remove(id)
  },

  // WebSocket messages

  _addTopicToTopicmap (_, {topicmapId, viewTopic}) {
    if (topicmapId === _topicmap.id) {
      const _viewTopic = new dmx.ViewTopic(viewTopic)
      _topicmap.addTopic(_viewTopic)                                      // update state
      cyView.addTopic(_viewTopic)                                         // update view
    }
  },

  _addAssocToTopicmap (_, {topicmapId, viewAssoc}) {
    if (topicmapId === _topicmap.id) {
      const _viewAssoc = new dmx.ViewAssoc(viewAssoc)
      _topicmap.addAssoc(_viewAssoc)                                      // update state
      cyView.addAssoc(_viewAssoc)                                         // update view
    }
  },

  _setTopicPosition (_, {topicmapId, topicId, pos}) {
    if (topicmapId === _topicmap.id) {
      // Note: the topic might not be in this topicmap because not readable by current user
      const viewTopic = _topicmap.getTopicIfExists(topicId)
      if (viewTopic) {
        viewTopic.setPosition(pos)                                        // update state
        if (viewTopic.isVisible()) {
          cyView.updateTopicPos(topicId, pos)                             // update view
        }
      }
    }
  },

  _setTopicVisibility (_, {topicmapId, topicId, visibility}) {
    if (topicmapId === _topicmap.id) {
      const viewTopic = _topicmap.getTopicIfExists(topicId)
      if (viewTopic) {
        viewTopic.setVisibility(visibility)                               // update state
        if (visibility) {
          cyView.addTopic(viewTopic)                                      // update view
          autoRevealAssocs(topicId)
        } else {
          _topicmap.hideAssocsWithPlayer(topicId)                         // update state
          cyView.remove(topicId)                                          // update view
        }
      }
    }
  },

  _setAssocVisibility (_, {topicmapId, assocId, visibility}) {
    if (topicmapId === _topicmap.id) {
      const viewAssoc = _topicmap.getAssocIfExists(assocId)
      if (viewAssoc) {
        if (visibility) {
          viewAssoc.setVisibility(visibility)                             // update state
          cyView.addAssoc(viewAssoc)                                      // update view
        } else {
          _topicmap.removeAssocsWithPlayer(assocId)                       // update state
          _topicmap.removeAssoc(assocId)                                  // update state
          cyView.remove(assocId)                                          // update view
        }
      }
    }
  },

  _processDirectives (_, directives) {
    // console.log(`Cytoscape Renderer: processing ${directives.length} directives`)
    directives.forEach(dir => {
      switch (dir.type) {
      case 'UPDATE_TOPIC':
        const topic = new dmx.Topic(dir.arg)
        updateTopic(topic)
        updateDetail(topic)
        break
      case 'DELETE_TOPIC':
        deleteTopic(dir.arg)
        break
      case 'UPDATE_ASSOC':
        const assoc = new dmx.Assoc(dir.arg)
        updateAssoc(assoc)
        updateDetail(assoc)
        break
      case 'DELETE_ASSOC':
        deleteAssoc(dir.arg)
        break
      case 'UPDATE_TOPIC_TYPE':
        // TODO: cyView.update() would be sufficient if rendering would rely on viewTopic's computed props instead of
        // per-instance "data" (see cyNode() in cytoscape-view.js). Like "arrow heads" rendering on role type update.
        updateTopicIcons(dir.arg.uri)
        break
      case 'UPDATE_ASSOC_TYPE':
        // TODO: cyView.update() would be sufficient if rendering would rely on viewAssoc's computed props instead of
        // per-instance "data" (see cyEdge() in cytoscape-view.js). Like "arrow heads" rendering on role type update.
        updateAssocColors(dir.arg.uri)
        break
      case 'UPDATE_ROLE_TYPE':
        cyView.update()
        break
      }
    })
  },

  // === Cytoscape View ===

  // Module internal actions (dispatched from dmx-cytoscape-renderer components or cytoscape-view.js)

  /**
   * @param   container   the container DOM element for the Cytoscape instance
   * @param   parent      the dmx-topicmap-panel (a Vue instance)
   * @param   box         the DOM element used for measurement
   */
  _initCytoscape ({dispatch}, {container, contextCommands, dropHandler, parent, box}) {
    cyView = new CytoscapeView(container, contextCommands, dropHandler, parent, box, modifiers, dispatch)
  },

  _syncObject (_, object) {
    _object = object
  },

  _syncWritable (_, writable) {
    state.objectWritable = writable
  },

  // Note: no debounce here; consecutive calls might relate to *different* details,
  // in particular when loading a topicmap with several pinned topics which have images
  _syncDetailSize (_, id) {
    // Note: at the time assoc parts arrive the detail size needs to be adjusted.
    // If the assoc is unselected meanwhile the detail record does not exist anymore.
    const detail = _detail(id)
    if (!detail) {
      console.warn(`adjustDetailSize() when detail ${id} is undefined`)
    }
    detail && adjustDetailSize(detail)
  },

  _syncViewport (_, {pan, zoom}) {
    // update state
    _topicmap.setViewport(pan, zoom)
    state.zoom = zoom
    Object.values(state.details).forEach(repositionDetail)
    // update server
    if (_topicmapWritable) {
      dmx.rpc.setTopicmapViewport(_topicmap.id, pan, zoom)
    }
  },

  _syncActive (_, id) {
    state.activeId = id
  },

  _setModifiers (_, _modifiers) {
    Object.assign(modifiers, _modifiers)
  },

  // Cross-Module

  /**
   * Renders a topic/assoc as selected, and the previously selected one as unselected, if any.
   * If requested: shows in-map details and plays the fisheye animation.
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
   *            whether to show topic/assoc in-map details (boolean)
   */
  renderAsSelected (_, {id, p, showDetails}) {
    // Note: if selectById() throws we don't want create the promise. Otherwise we would get 2 error messages instead of
    // one due to nested promises. renderAsSelected() runs itself in a promise executor function (before an object can
    // be rendered as selected the topicmap rendering must be complete).
    const _ele = cyView.selectById(id)     // selectById() restores selection after switching topicmap
    // Note: programmatic unselect() is required for browser history navigation. If *interactively* selecting a node
    // Cytoscape removes the current selection before. In contrast if *programmatically* selecting a node Cytoscape does
    // *not* remove the current selection.
    const p2 = ele && unselectElement()
    //
    if (showDetails) {
      // Note: the fisheye animation can only be started once the restore animation is complete, *and* "object" is
      // available. The actual order of these 2 occasions doesn't matter.
      Promise.all([p, p2])
        .then(createAndShowSelectionDetail)
        .then(() => {
          cyView.autoPan(detail(id).renderedBoundingBox)
        })
    } else {
      cyView.autoPanForNode(_ele)
    }
    //
    ele = _ele
  },

  renderAsUnselected () {
    const p = unselectElement()
    p && p.then(playFisheyeAnimationIfDetailsOnscreen)
    ele = undefined
  },

  /**
   * Renders an element as selected without displaying the element's details.
   *
   * Called by host application to visualize a multi selection, or to visually restore the former selection when a
   * navigation was aborted (by closing a "Unsaved Changes" warning).
   */
  _renderAsSelected (_, id) {
    // Note: when a navigation was aborted (by closing a "Unsaved Changes" warning) Cytoscape has removed the visual
    // selection from the former object already and the app calls "_renderAsSelected" in order to visually restore the
    // former selection. In this case calling "_renderAsSelected" when ele is defined already is not an error.
    cyView.selectById(id)
  },

  /**
   * Renders an element as unselected without removing the element's details (and without playing the restore
   * animation).
   *
   * Called by host application to visually remove a multi selection (e.g. after a route switch).
   *
   * @throws  if this component is not in single selection state.
   */
  _renderAsUnselected (_, id) {
    if (!ele) {
      throw Error(`_renderAsUnselected(${id}) when "ele" is not set`)
    }
    cyView.unselectById(id)
  },

  _removeDetail () {
    removeSelectionDetail()
  },

  fitTopicmapViewport () {
    cyView.fit()
  },

  resetTopicmapViewport () {
    cyView.reset()
  }
}

export default {
  state,
  actions
}

// === DMX Model ===

// Update state

function hideAssocsWithPlayer (id) {
  _topicmap.getAssocsWithPlayer(id).forEach(assoc => {
    assoc.setVisibility(false)
    _removeDetailIfOnscreen(assoc.id)
    hideAssocsWithPlayer(assoc.id)        // recursion
  })
}

function removeAssocsWithPlayer (id) {
  _topicmap.getAssocsWithPlayer(id).forEach(assoc => {
    _topicmap.removeAssoc(assoc.id)
    _removeDetailIfOnscreen(assoc.id)
    removeAssocsWithPlayer(assoc.id)      // recursion
  })
}

// Update state + view

/**
 * @param   id    a topic ID or an assoc ID
 */
function autoRevealAssocs (id) {
  _topicmap.getAssocsWithPlayer(id)
    .filter(viewAssoc => _topicmap.getOtherPlayer(viewAssoc, id).isVisible())
    .forEach(viewAssoc => {
      _revealAssoc(viewAssoc)
      autoRevealAssocs(viewAssoc.id)      // recursion
    })
}

/**
 * @param   topic     the topic to reveal (dmx.Topic).
 * @param   pos       Optional: the topic position in model coordinates (object with "x", "y" props).
 *                    If not given it's up to the topicmap renderer to position the topic.
 * @param   autoPan   Optional: if trueish the topicmap is panned so that the topic is within viewport.
 */
function _revealTopic (topic, pos, autoPan) {
  // update state
  const op = _topicmap.revealTopic(topic, pos)
  // update view
  if (op.type === 'add' || op.type === 'show') {
    cyView.addTopic(initPos(op.viewTopic))
  }
  if (autoPan) {
    cyView.autoPanById(topic.id)
  }
  return op
}

/**
 * @param   assoc     the assoc to reveal (dmx.Assoc).
 */
function _revealAssoc (assoc) {
  // update state
  const op = _topicmap.revealAssoc(assoc)
  // update view
  if (op.type === 'add' || op.type === 'show') {
    cyView.addAssoc(op.viewAssoc)
  }
  return op
}

// Process directives

/**
 * Processes an UPDATE_TOPIC directive.
 */
function updateTopic (topic) {
  const viewTopic = _topicmap.getTopicIfExists(topic.id)
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
 * Processes an UPDATE_ASSOC directive.
 */
function updateAssoc (assoc) {
  const viewAssoc = _topicmap.getAssocIfExists(assoc.id)
  if (viewAssoc) {
    // update state
    viewAssoc.value = assoc.value
    viewAssoc.typeUri = assoc.typeUri
    viewAssoc.player1.roleTypeUri = assoc.player1.roleTypeUri
    viewAssoc.player2.roleTypeUri = assoc.player2.roleTypeUri
    // update view
    if (viewAssoc.isVisible()) {
      cyView.updateAssoc(assoc.id, {
        label: assoc.value,
        color: assoc.color
      })
    }
  }
}

/**
 * Processes a DELETE_TOPIC directive.
 */
function deleteTopic (topic) {
  // Note: state is already updated by dmx-topicmap-panel
  //
  // update view
  cyView.remove(topic.id)
}

/**
 * Processes a DELETE_ASSOC directive.
 */
function deleteAssoc (assoc) {
  // Note: state is already updated by dmx-topicmap-panel
  //
  // update view
  cyView.remove(assoc.id)
}

/**
 * Processes an UPDATE_TOPIC_TYPE directive.
 */
function updateTopicIcons (typeUri) {
  _topicmap.topics
    .filter(topic => topic.typeUri === typeUri)
    .filter(topic => topic.isVisible())
    .forEach(topic => {
      // Note: no state update here. Topic icon/color is not part of ViewTopic but computed based on type definition.
      // Type cache is up-to-date already. De-facto the Type Cache processes directives *before* Topicmap Model
      // processes directives.
      //
      // update view
      cyView.updateTopic(topic.id, {
        icon:            topic.icon,
        iconColor:       topic.iconColor,
        backgroundColor: topic.backgroundColor
      })
    })
}

/**
 * Processes an UPDATE_ASSOC_TYPE directive.
 */
function updateAssocColors (typeUri) {
  _topicmap.assocs
    .filter(assoc => assoc.typeUri === typeUri)
    .filter(assoc => assoc.isVisible())
    .forEach(assoc => {
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

// Helper

/**
 * Auto-position topic if no position is set.
 */
function initPos (viewTopic) {
  if (viewTopic.getViewProp('dmx.topicmaps.x') === undefined) {
    const pos = {}
    if (_object) {
      // If there is a single selection: place lower/left to the selected topic/assoc
      // TODO: more elaborated placement, e.g. at near free position?
      const p = _topicmap.getPosition(_object.id)
      pos.x = p.x + POS_DX
      pos.y = p.y + POS_DY
    } else {
      pos.x = POS_X
      pos.y = POS_Y
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
 * Note: the fisheye animation is *not* played. unselectElement() is a low-level function, possibly be be executed as
 * part of a render-as-selected operation which is responsible for playing the fisheye animation.
 *
 * Precondition:
 * - an element is selected
 *
 * @return  if the restore animation is played: a promise resolved once the animation is complete, otherwise undefined
 */
function unselectElement () {
  if (!ele) {
    // Note: normally "ele" is expected to be defined when entering this function.
    // Normally the route is the source of truth, and changing app state is the *effect* of a route change. But there is
    // one situation where cause/effect is reversed, which is login/logout. On login/logout the topipcmap is reloaded,
    // and only then is checked whether the selection must be stripped from route. If so the selection is removed
    // already when entering this function and "ele" is undefined.
    // The proper solution would be to check e.g. *before* logout if the selected workspace and the selected object
    // would still be readable after logout. This would get rather complicate.
    return
  }
  // Note 1: when the user clicks on the background Cytoscape unselects the selected element on its own.
  // Calling cy.elements(":selected") afterwards would return an empty collection.
  // This is why we maintain an explicit "ele" state.
  // Note 2: unselect() removes the element's selection style when manually stripping selection from route.
  // In this situation cy.elements(":selected") would return a non-empty collection.
  cyView.unselect(ele)
  //
  return removeSelectionDetail()
}

// Details

/**
 * @return  a promise resolved once the animation is complete.
 */
function playRestoreAnimation () {
  return AUTO_LAYOUT ?                                                            /* eslint operator-linebreak: "off" */
    Promise.all(_topicmap.topics
      .filter(viewTopic => viewTopic.isVisible())
      .map(viewTopic => cyView.updateTopicPos(viewTopic.id, viewTopic.pos))
    )
    : Promise.resolve()
}

function showPinnedDetails () {
  _topicmap.topics
    .filter(topic => topic.isPinned() && topic.isVisible())
    .forEach(topic => createDetail(topic).then(showDetail))
  _topicmap.assocs
    .filter(assoc => assoc.isPinned() && assoc.isVisible())
    .forEach(assoc => createDetail(assoc).then(showDetail))
  return _topicmap
}

/**
 * Creates a detail record for the given object.
 *
 * @param   viewObject    a dmx.ViewTopic or a dmx.ViewAssoc
 *
 * @return  a promise for the created detail record
 */
function createDetail (viewObject) {
  const id = viewObject.id
  const node = cyView.detailNode(id)
  const detail = {
    id,
    object: undefined,
    bbr: node.renderedBoundingBox(),
    pos: undefined,
    size: undefined,
    writable: undefined,
    get node () {           // Note: Cytoscape objects must not be used as Vue.js state.
      return node           // By using a getter (instead a prop) the object is not made reactive.
    },
    // Note: a property would not be reactive. With a getter it works.
    get pinned () {
      return viewObject.isPinned()
    },
    get renderedBoundingBox () {
      return {
        x1: this.pos.x,
        y1: this.pos.y,
        x2: this.pos.x + (this.size.width * state.zoom),
        y2: this.pos.y + (this.size.height * state.zoom)
      }
    }
  }
  listenPosition(detail)
  return new Promise(resolve => {
    viewObject.fetchObject().then(object => {
      detail.object = object.isType ? object.asType() : object    // logical copy in updateDetail()
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
  const id = eleId(ele)
  const node = cyView.detailNode(id)
  let viewObject
  if (ele.isNode()) {
    viewObject = _topicmap.getTopic(id)
  } else {
    viewObject = _topicmap.getAssoc(id)
    cyView.select(node)     // select aux node along with assoc
  }
  const detail = {
    id,
    object: _object,
    bbr: node.renderedBoundingBox(),
    pos: undefined,
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
    },
    get renderedBoundingBox () {
      return {
        x1: this.pos.x,
        y1: this.pos.y,
        x2: this.pos.x + (this.size.width * state.zoom),
        y2: this.pos.y + (this.size.height * state.zoom)
      }
    }
  }
  listenPosition(detail)
  return detail
}

/**
 * @return  a promise resolved once the fisheye animation is complete.
 *          At this moment "detail.pos" and "detail.size" are up-to-date (via side effect).
 */
function createAndShowSelectionDetail () {
  if (!ele) {
    console.warn('createDetailForSelection() when "ele" is undefined')
    return
  }
  return showDetail(createDetailForSelection())
}

/**
 * @return  a promise resolved once the fisheye animation is complete
 */
function showDetail (detail) {
  detail.node.addClass('expanded')
  Vue.set(state.details, detail.id, detail)       // Vue.set() triggers dmx-detail-layer rendering
  return Vue.nextTick().then(
    () => adjustDetailSize(detail)
  )
}

/**
 * Measures the size of the given detail, and updates its "pos" and "size" properties.
 * Plays the fisheye animation.
 *
 * Precondition:
 * - the DOM is updated already.
 *
 * @param   detail    a detail record
 *
 * @return  a promise resolved once the fisheye animation is complete
 */
function adjustDetailSize (detail) {
  const detailDOM = document.querySelector(`.dmx-detail-layer .dmx-detail[data-detail-id="${detail.id}"]`)
  if (!detailDOM) {
    throw Error(`detail DOM ${detail.id} not found`)
  }
  detail.pos = {
    x: detailDOM.offsetLeft,
    y: detailDOM.offsetTop,
  }
  detail.size = {
    width:  detailDOM.clientWidth,
    height: detailDOM.clientHeight
  }
  return new Promise(resolve => {
    if (AUTO_LAYOUT) {
      cyView.playFisheyeAnimation(resolve)
    } else {
      resolve()
    }
  })
}

function removeDetailIfUnpinned (id, pinned, showDetails) {
  if (!pinned && (!isSelected(id) || !showDetails)) {
    removeDetail(detail(id)).then(playFisheyeAnimationIfDetailsOnscreen)
  }
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
 * Removes the given detail from screen and plays the restore animation.
 *
 * @return  a promise resolved once the restore animation is complete.
 */
function removeDetail (detail) {
  // update state
  _removeDetail(detail)
  // update view
  detail.node.off('position')                       // FIXME: do not unregister *all* position handlers?
  detail.node.removeClass('expanded')
  detail.node.style({width: null, height: null})    // reset size
  cyView.hideEdgeHandle()
  return playRestoreAnimation()
}

function _removeDetailIfOnscreen (id) {
  // update state
  const detail = _detail(id)
  detail && _removeDetail(detail)
}

function _removeDetail (detail) {
  // update state
  Vue.delete(state.details, detail.id)              // Vue.delete() triggers dmx-detail-layer rendering
}

function updateDetail (object) {
  const detail = Object.values(state.details).find(detail => detail.id === object.id)
  if (detail) {
    detail.object = object.isType ? object.asType() : object    // logical copy in createDetail()
  }
}

function listenPosition (detail) {
  detail.node.on('position', () => {
    repositionDetail(detail)
  })
}

function repositionDetail (detail) {
  detail.bbr = detail.node.renderedBoundingBox({includeOverlays: false})
}

function playFisheyeAnimationIfDetailsOnscreen () {
  if (AUTO_LAYOUT && !dmx.utils.isEmpty(state.details)) {
    cyView.playFisheyeAnimation()
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

// Helper

function isSelected (objectId) {
  return ele && eleId(ele) === objectId
}

// copy in dmx-cytoscape-renderer.vue
// copy in dmx-detail-layer.vue
// copy in cytoscape-edge-connections (index.js)
function eleId (ele) {
  // Note: Cytoscape element IDs are strings
  return Number(ele.id())
}
