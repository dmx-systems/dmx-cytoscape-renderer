<template>
  <div class="dm5-cytoscape-renderer" @mousedown.capture="mousedown">
    <div class="cytoscape-container" ref="cytoscape-container"></div>
    <div class="measurement-box" ref="measurement-box"></div>
    <dm5-detail-layer :detail-renderers="detailRenderers" :quill-config="quillConfig"
      @object-submit="submitObject" @child-topic-reveal="revealChildTopic">
    </dm5-detail-layer>
  </div>
</template>

<script>
import dm5 from 'dm5'

export default {

  created () {
    // console.log('dm5-cytoscape-renderer created', this.showInmapDetails)
    this._syncShowInmapDetails()
  },

  // create Cytoscape instance once DOM is ready
  mounted () {
    // console.log('dm5-cytoscape-renderer mounted')
    this.$store.dispatch('_initCytoscape', {
      parent:          this.$parent,
      container:       this.$refs['cytoscape-container'],
      box:             this.$refs['measurement-box'],
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
    showInmapDetails: Boolean,
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
    },

    showInmapDetails () {
      // console.log('showInmapDetails watcher dm5-cytoscape-renderer', this.showInmapDetails)
      this._syncShowInmapDetails()
    }
  },

  methods: {

    submitObject (object) {
      this.$parent.$emit('object-submit', object)
    },

    revealChildTopic (relTopic) {
      this.$parent.$emit('child-topic-reveal', relTopic)
    },

    _syncShowInmapDetails () {
      this.$store.dispatch('_syncShowInmapDetails', this.showInmapDetails)
    },

    mousedown (e) {
      this.$store.dispatch('_setModifiers', {alt: e.altKey})
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

.dm5-cytoscape-renderer .cytoscape-container .cxtmenu .cxtmenu-item .cxtmenu-disabled {
  opacity: 0.5;
}

.dm5-cytoscape-renderer .measurement-box {
  position: absolute;
  visibility: hidden;
}
</style>
