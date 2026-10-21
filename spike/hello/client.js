window.__ModuleLoader__.load({
  id: 'dsh-kicad-spike-hello',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ID = 'dsh-kicad-spike-hello'
    function Body(props) {
      const { tab } = props.useTabInfo()
      return h('div', { 'data-kicad-spike': 'body', style: { padding: 12 } },
        'KiCad spike tab: ', h('code', null, tab.contentId ?? ''))
    }
    return {
      inject: ['slots', 'sidebarRightTabs'],
      apply(ctx) {
        window.__DSH_KICAD_SPIKE__ = { state: 'client-applied', ctx }
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID, kind: 'kicad-spike', patterns: ['*.kicad_sch', '*.kicad_pcb'],
          title: address => decodeURIComponent(address.slice(address.lastIndexOf('/') + 1)),
        }), 'kicad spike tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: ID }, Body,
        )), 'kicad spike tab body')
      },
    }
  },
})
