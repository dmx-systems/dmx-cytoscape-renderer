<template>
  <div :class="['dmx-topic', {selected}]" :style="style">
    {{viewTopic.value}}
  </div>
</template>

<script>
export default {

  props: {
    viewTopic: {type: Object, required: true}
  },

  computed: {

    style () {
      return {
        top:  `${this.viewTopic.pos.y * this.zoom + this.topicmap.panY}px`,
        left: `${this.viewTopic.pos.x * this.zoom + this.topicmap.panX}px`,
        transform: `scale(${this.zoom}) translate(-50%, 60%)`,  // for debugging, FIXME: -50%, -50%
        backgroundColor: this.viewTopic.backgroundColor
      }
    },

    selected () {
      return this.selection.includesId(this.viewTopic.id)
    },

    zoom () {
      return this.topicmap.zoom
    },

    topicmap () {
      return this.$store.state['dmx.topicmaps.topicmap'].topicmap
    },

    selection () {
      return this.$store.state['dmx.topicmaps.topicmap'].selection
    }
  }
}
</script>

<style>
.dmx-topic {
  position: absolute;
  padding: 4px;
  border: 1px solid var(--border-color-lighter);
  transform-origin: top left;
  /* opacity: 0.8; */
}

.dmx-topic.selected {
  border-color: var(--highlight-color);
}
</style>
