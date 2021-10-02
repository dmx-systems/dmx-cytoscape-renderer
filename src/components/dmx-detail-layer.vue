<template>
  <div class="dmx-detail-layer">
    <transition-group name="detail">
      <dmx-detail v-for="detail in details" :detail="detail" :detail-renderers="detailRenderers"
        :quill-config="quillConfig" :key="detail.node.id()">
      </dmx-detail>
    </transition-group>
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
:root {
  --min-detail-scale: 1;
}

.dmx-detail-layer {
  position: absolute;
  width: 10000px;     /* avoid early line wrapping */
  top: 0;
}

.dmx-detail-layer .detail-enter-active {
  animation: detail 0.3s;
  transition: opacity 0.3s;
}

.dmx-detail-layer .detail-leave-active {
  animation: detail 0.3s reverse;
  transition: opacity 0.3s;
}

.dmx-detail-layer .detail-enter,
.dmx-detail-layer .detail-leave-to {
  opacity: 0.4;
}

@keyframes detail {
  0% {
    transform: scale(var(--min-detail-scale));
  }
}
</style>
