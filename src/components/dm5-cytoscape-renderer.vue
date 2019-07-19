<template>
  <div class="dm5-cytoscape-renderer" @mousedown.capture="mousedown">
    <div class="cytoscape-container" ref="cytoscape-container" @contextmenu.capture.prevent="contextmenu"></div>
    <div class="measurement-box" ref="measurement-box"></div>
    <dm5-detail-layer :detail-renderers="detailRenderers" :quill-config="quillConfig"></dm5-detail-layer>
  </div>
</template>

<script>
import dm5 from 'dm5'

export default {

  created () {
    // console.log('dm5-cytoscape-renderer created')
  },

  // create Cytoscape instance once DOM is ready
  mounted () {
    // console.log('dm5-cytoscape-renderer mounted')
    this.$store.dispatch('_initCytoscape', {
      parent:          this.$parent,
      container:       this.$refs['cytoscape-container'],     // only known in mounted()
      box:             this.$refs['measurement-box'],         // only known in mounted()
      contextCommands: this.contextCommands
    })
  },

  destroyed () {
    console.log('dm5-cytoscape-renderer destroyed')
    // Note: at this time the store modules are switched already
  },

  mixins: [
    require('./mixins/detail-renderers').default
  ],

  props: {
    object: dm5.DMXObject,
    writable: Boolean,
    contextCommands: Object,
    quillConfig: Object
  },

  watch: {

    object () {
      // console.log('object watcher dm5-cytoscape-renderer', this.object)
      this.$store.dispatch('_syncObject', this.object)
    },

    writable () {
      // console.log('writable watcher dm5-cytoscape-renderer', this.writable)
      this.$store.dispatch('_syncWritable', this.writable)
    }
  },

  methods: {

    mousedown (e) {
      this.$store.dispatch('_setModifiers', {
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey
      })
    },

    contextmenu (e) {
      console.log('contextmenu')
      e.preventDefault()            // TODO: needed?
      e.stopImmediatePropagation()  // TODO: needed?
      return false                  // TODO: needed?
    }
  },

  components: {
    'dm5-detail-layer': require('./dm5-detail-layer').default
  }
}
</script>

<style>
.dm5-cytoscape-renderer {
  height: 100%;
}

.dm5-cytoscape-renderer .cytoscape-container {
  height: 100%;
}

.dm5-cytoscape-renderer .measurement-box {
  position: absolute;
  visibility: hidden;
}
</style>
