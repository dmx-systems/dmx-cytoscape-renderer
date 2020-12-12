<template>
  <div class="dm5-detail-layer">
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
    }
  },

  components: {
    'dmx-detail': require('./dmx-detail').default
  }
}

</script>

<style>
.dm5-detail-layer {
  position: absolute;
  width: 10000px;     /* avoid early line wrapping */
  top: 0;
}
</style>
