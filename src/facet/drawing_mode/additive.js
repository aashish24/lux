Facet.DrawingMode.additive = {
    set_draw_caps: function()
    {
        var ctx = Facet.ctx;
        ctx.enable(ctx.BLEND);
        ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE);
        ctx.enable(ctx.DEPTH_TEST);
        ctx.depthFunc(ctx.LESS);
        ctx.depthMask(false);
    },
    set_pick_caps: function()
    {
        var ctx = Facet.ctx;
        ctx.enable(ctx.DEPTH_TEST);
        ctx.depthFunc(ctx.LESS);
        ctx.depthMask(false);
    }
};