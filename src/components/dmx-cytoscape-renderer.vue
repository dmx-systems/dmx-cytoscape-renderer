<template>
  <div class="dmx-cytoscape-renderer" @mousedown.capture="mousedown">
    <img v-if="imageUrl" :src="imageUrl" :style="imageStyle">
    <div class="cytoscape-container" ref="cytoscape-container"></div>
    <dmx-html-overlay :detail-renderers="detailRenderers" :quill-config="quillConfig"></dmx-html-overlay>
  </div>
</template>

<script>
import dmx from 'dmx-api'

export default {

  created () {
    // console.log('dmx-cytoscape-renderer created')
  },

  // create Cytoscape instance once DOM is ready
  mounted () {
    // console.log('dmx-cytoscape-renderer mounted')
    this.$store.dispatch('_initCytoscape', {
      parent:          this.$parent,
      container:       this.$refs['cytoscape-container'],     // only known in mounted()
      contextCommands: this.contextCommands,
      dropHandler:     this.dropHandler
    })
    this.$store.watch(
      state => state['dmx.topicmaps.topicmap']?.topicmap?.zoom,
      zoom => {
        // console.log('zoom watch', zoom)
        if (zoom) {
          document.body.style.setProperty('--min-detail-scale', 0.4 * zoom)
        }
      }
    )
  },

  destroyed () {
    // console.log('dmx-cytoscape-renderer destroyed')
    // Note: at this time the store modules are switched already
  },

  mixins: [
    require('./mixins/detail-renderers').default
  ],

  props: {
    topicmap: Object,
    object: dmx.DMXObject,
    writable: Boolean,
    contextCommands: Object,
    dropHandler: Array,
    quillConfig: Object
  },

  computed: {

    panX () {
      return this.topicmap && this.topicmap.panX
    },

    panY () {
      return this.topicmap && this.topicmap.panY
    },

    zoom () {
      return this.topicmap && this.topicmap.zoom
    },

    imageUrl () {
      return this.topicmap && this.topicmap.bgImageUrl
    },

    imageStyle () {
      return {
        transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`,
        'transform-origin': 'top left'
      }
    }
  },

  watch: {

    object () {
      // console.log('object watcher dmx-cytoscape-renderer', this.object)
      this.$store.dispatch('_syncObject', this.object)
    },

    writable () {
      // console.log('writable watcher dmx-cytoscape-renderer', this.writable)
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
    }
  },

  components: {
    'dmx-html-overlay': require('./dmx-html-overlay').default
  }
}
</script>

<style>
.dmx-cytoscape-renderer {
  height: 100%;
}

.dmx-cytoscape-renderer .cytoscape-container {
  height: 100%;
}

.dmx-cytoscape-renderer > img {
  position: absolute;
}
</style>
