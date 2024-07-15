<template>
  <div :class="classes" :style="style">
    <span class="fa icon" :style="iconStyle">{{viewTopic.icon}}</span>
    <span>{{viewTopic.value}}</span>
  </div>
</template>

<script>
export default {

  props: {
    viewTopic: {type: Object, required: true}
  },

  computed: {

    classes () {
      return ['dmx-topic', {selected: this.selected}, ...this.topicClasses || []]
    },

    style () {
      return {
        top:  `${this.viewTopic.pos.y * this.zoom + this.topicmap.panY}px`,
        left: `${this.viewTopic.pos.x * this.zoom + this.topicmap.panX}px`,
        transform: `scale(${this.zoom}) translate(-50%, -50%)`,
        backgroundColor: this.viewTopic.backgroundColor
      }
    },

    iconStyle () {
      return {
        color: this.viewTopic.iconColor
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
    },

    topicClasses () {
      return this.$store.state['dmx.topicmaps.topicmap'].topicClasses[this.viewTopic.id]
    }
  }
}
</script>

<style>
.dmx-topic {
  position: absolute;
  padding: 4px 5px;
  border: 1px solid var(--border-color-lighter);
  transform-origin: top left;
  pointer-events: none;
  opacity: 0.7;
}

.dmx-topic.selected, .dmx-topic.hover {
  border: 2px solid var(--highlight-color);
}

.dmx-topic .icon {
  font-size: 16px;
  margin-right: 4px;
  vertical-align: text-bottom;
}
</style>
