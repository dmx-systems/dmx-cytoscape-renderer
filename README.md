# DeepaMehta 5 Cytoscape Renderer

A DeepaMehta 5 topicmap renderer as a composable GUI component.

## Version History

**0.18** -- Apr 1, 2019

* Features:
    * Auto assoc revelation
    * Persistent topicmap pan/zoom state
    * Support for assoc visibility
* Composability: don't dispatch into host app (no router calls)
* API: add `select` param to `revealRelatedTopic()` action 
* Fixes:
    * Positioning of rotated assoc labels
    * Pin/unpin when lacking write permission

**0.17** -- Mar 2, 2019

* Features:
    * The display of in-map details is optional on a per-selection basis
    * Alt-right clicking a topic/assoc invokes a (configurable) "danger zone" menu
* Fixes:
    * Update icons when topics are hidden
    * Various client-sync fixes in conjunction with hidden topics
    * Don't play restore animation if no in-map details are removed
* Chore:
    * Internal refactoring: more efficient communication with `dm5-topicmap-panel` parent component

**0.16** -- Jan 29, 2019

* API:
    * Promise returned by `renderTopicmap` action resolves with topicmap
    * Context commands: caller can provide function to disable commands dynamically
* Fixes:
    * No context menu for "edge handle" nodes
    * Pinned assocs which have assoc players
    * Remove assocs with assoc players from client state on hide/delete
    * Client-sync when revealing assocs with assoc players
    * `addAssocToTopicmap` message contains assoc view props
    * Make async operations more robust
* Chore:
    * Adapt to `dm5` library and `cytoscpae-edge-connections`
    * Internal refactoring
    * Change license to `GPL-3.0-or-later`

**0.15** -- Jan 5, 2019

* Assocs can connect other assocs (utilizing `cytoscpae-edge-connections`)
* New create-association gesture: drawing instead of drag'n'drop (utilizing `cytoscape-edgehandles`)
* Rename event `topic-drop-on-topic` -> `assoc-create`

**0.14** -- Dec 21, 2018

* Cytoscape 3.3 compatibility: don't put Cytoscape objects in Vue state

**0.13** -- Nov 24, 2018

* Add `visibleAssocIds` getter
* Add `cyEdge()` argument check

**0.12** -- Nov 7, 2018

* Debounce node resizing
* Fix: update assoc color on retype

**0.11** -- Oct 21, 2018

* Rename component prop `object-renderers` to `detail-renderers`. It contains both, `object` and `value` renderers.
* Fix: refresh topic icons and assoc colors on view config change

**0.10** -- Oct 6, 2018

* In-map detail component does not render title. The underlying object renderer has full rendering control.
* Store module provides a `visibleTopicIds` getter

**0.9** -- Jul 31, 2018

* Change type URI prefixes `dm4` -> `dmx`
* Add GitLab CI/CD

**0.8** -- Jul 17, 2018

* Fixes:
    * Visualization of selected pinned details
    * Revealing assoc-related topics
    * Renaming types

**0.7** -- Jun 20, 2018

* Multi-selection:
    * Hide/Delete multiple topics/assocs
    * For multi-operations a single request is sent
* Fixes:
    * Executing "Delete" command when context menu is opened via tap-hold
    * Unpin topic/assoc on delete
* Improved composability: component emits `topics-drag` event to signalize a multi-move

**0.6** -- Jun 6, 2018

* Multi-selection: disable "single-only" context commands
* Fix: interacting with assocs when they are expanded

**0.5** -- May 13, 2018

* Multi-selection:
    * Move multiple topics
    * Issue context commands for multiple topics
    * Fix: unpin topic/assoc on hide

**0.4** -- May 1, 2018

* Support for multi-selection:
    * 2 new component events: `topic-unselect`, `assoc-unselect`
    * 2 new low-level actions: `_syncSelect`, `_syncUnselect`

**0.3** -- Apr 10, 2018

* Fix: sync `writable` flag with parent component

**0.2** -- Apr 7, 2018

* Compatible with `dm5-topicmap-panel`'s renderer switching architecture

**0.1** -- Mar 26, 2018

* Factored out as a standalone component from:  
  https://github.com/jri/dm5-topicmap-panel

------------
Jörg Richter  
Apr 1, 2019
