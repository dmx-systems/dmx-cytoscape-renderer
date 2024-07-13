<template>
  <div class="dmx-topic" :style="style">
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
        top:  `${this.viewTopic.pos.y}px`,
        left: `${this.viewTopic.pos.x}px`
      }
    }
  }
}
</script>

<style>
.dmx-topic {
  position: absolute;
  width: 50px;
  height: 50px;
  background-color: beige;
}
</style>
