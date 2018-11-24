# DeepaMehta 5 Cytoscape Renderer

A DeepaMehta 5 topicmap renderer as a composable GUI component.

## Version History

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
Nov 24, 2018
