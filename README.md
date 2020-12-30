# DMX 5 Cytoscape Renderer

A DMX 5 topicmap renderer as a composable GUI component.

## Version History

**2.0** -- Dec 30, 2020

* BREAKING CHANGES
    * Make use of `dmx-api` 2.0
    * Various `dm5` -> `dmx` renamings
* Improvements:
    * API: action `renderRelatedTopic` accepts `pos` option
* Fixes:
    * Providing context commands asynchronously
* Chore:
    * Adapt URLs to `github.com/dmx-systems`
    * Code run through `eslint`

**1.0.2** -- Aug 6, 2020

* Chore: bump `dmx-object-renderer` dependency

**1.0.1** -- Aug 5, 2020

* Chore: bump `dmx-object-renderer` dependency

**1.0** -- Aug 4, 2020

* Fixes:
    * Client-sync when a public topicmap has private/confidential portions
* Chore:
    * Rename this package `dm5-cytoscape-renderer` -> `dmx-cytoscape-renderer`
    * Update to Cytoscape 3.15.2

**0.26** -- Mar 30, 2020

* Features:
    * Context commands can be calculated dynamically
* Improvements:
    * Mobile friendly: fires `topicmap-contextmenu` on `taphold` as well
* Fixes:
    * Pinned details respect zoom value at initial rendering
* Chore:
    * Update to Cytoscape 3.14.1
    * Remove `cytoscape-cose-bilkent` dependency

**0.25** -- Nov 21, 2019

* Improvements:
    * Disable topicmap auto-layout/animation
    * Topicmap pans automatically when a topic is revealed outside viewport
    * Topicmap rendering respects individual topic icon widths
    * "Zoom to Fit" and "Reset Zoom" operations are animated
* Fixes:
    * State management when selected topic/assoc is not visible/readable anymore after login/logout
    * Disable draw-assoc gesture when user lacks WRITE permission
    * Topics whose label contains an ampersand are properly rendered
    * Initial topicmap rendering does not emit an unwanted `viewport` event

**0.24** -- Aug 26, 2019

* Improvements:
    * Adjust multi-command labels

**0.23** -- Aug 15, 2019

* Fixes:
    * Leave state update on delete topic/assoc to `dm5-topicmap-panel` component

**0.22** -- Jul 22, 2019

* Improvements:
    * HTML links are still clickable when detail is locked
    * Enable browser/system context menus
    * No auto-layout after user moves topic
    * Optimization: `renderNode()` memoization
* Fixes:
    * Revealing Number and Boolean topics
    * Style of expanded aux nodes
* Chore:
    * Adapt to `dm5` library ("player" renaming)
    * Change license to `AGPL-3.0`

**0.21** -- May 29, 2019

* Fix: revealed HTML topics are rendered as source (instead empty topic)

**0.20** -- May 27, 2019

* Improvements:
    * Render topic icon color and background color
    * In-map details: render with topic/assoc background color
    * Context menus: multi-commands show number of topics/assocs affected
    * Debounce `playFisheyeAnimation()`
* Fixes:
    * Truncate long node labels, in particular image binaries
    * Don't debounce `_syncDetailSize()`

**0.19** -- Apr 22, 2019

* Features:
    * 2 new topicmap buttons: "Zoom to Fit" and "Reset Zoom"
    * Auto pan topicmap when moving topic to viewport edge
* Improvements:
    * "Danger Zone" menu can be invoked by *any* modifier key
    * Disabled context menu items are visualized more clear
    * "Lock" and "Pin" detail buttons show tooltips
    * Send less requests on hide; unpin is implicit
* Fixes:
    * Implicitly hiding a pinned association does not corrupt topicmap
    * Implicitly hiding/deleting a pinned association removes detail from screen
    * Hide-multi for implicitly hidden associations
    * Box-selecting an association emits no "is already in list" console error
* API:
    * Attribute `contextCommands`: allow `disabled` function to return a promise
    * Composability: emit `topic-pin` and `assoc-pin` events
* Chore: upgrade to `cytoscape-cxtmenu` 3.1.0 (async menus!)

**0.18** -- Apr 1, 2019

* Features:
    * Auto assoc revelation
    * Persistent topicmap pan/zoom state
    * Support for assoc visibility
* API: add `select` param to `revealRelatedTopic()` action 
* Fixes:
    * Positioning of rotated assoc labels
    * Pin/unpin when lacking write permission
* Composability: don't dispatch into host app (no router calls)

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
Dec 30, 2020
