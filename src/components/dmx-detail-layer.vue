<template>
  <div class="dmx-detail-layer" :style="style">
    <dmx-detail v-for="detail in details" :detail="detail" :detail-renderers="detailRenderers"
      :quill-config="quillConfig" :key="detail.node.id()">
    </dmx-detail>
  </div>
</template>

<script>
export default {

  mixins: [
    require('./mixins/detail-renderers').default
  ],

  props: {
    quillConfig: Object
  },

  computed: {

    details () {
      const topicmapModel = this.$store.state['dmx.topicmaps.topicmap']
      if (!topicmapModel) {
        // console.log('Cytoscape renderer not available')
      }
      return topicmapModel && topicmapModel.details
    },

    pan () {
      return this.$store.state['dmx.topicmaps.topicmap'].pan
    },

    zoom () {
      return this.$store.state['dmx.topicmaps.topicmap'].zoom
    },

    style () {
      return this.pan && {
        transform: `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`
      }
    },
  },

  components: {
    'dmx-detail': require('./dmx-detail').default
  }
}

</script>

<style>
.dmx-detail-layer {
  position: absolute;
  top: 0;
}
</style>
