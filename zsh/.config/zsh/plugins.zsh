ZPLUGDIR="$HOME/.local/share/zsh"

[ ! -d $ZPLUGDIR/fsh ] && {
	git clone --depth 1 https://github.com/zdharma-continuum/fast-syntax-highlighting $ZPLUGDIR/fsh
	mv -- $ZPLUGDIR/fsh/{'→chroma','tmp'}
	zcompile-many $ZPLUGDIR/fsh/{fast*,.fast*,**/*.ch,**/*.zsh}
	mv -- $ZPLUGDIR/fsh/{'tmp','→chroma'}
}

[ ! -d $ZPLUGDIR/zsh-autosuggestions ] && {
	git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions $ZPLUGDIR/zsh-autosuggestions
	zcompile-many $ZPLUGDIR/zsh-autosuggestions/{zsh-autosuggestions.zsh,src/**/*.zsh}
}
unfunction zcompile-many

ZSH_AUTOSUGGEST_MANUAL_REBIND=1  
source $ZPLUGDIR/fsh/fast-syntax-highlighting.plugin.zsh && fast-theme XDG:catppuccin-mocha > /dev/null 
source $ZPLUGDIR/zsh-autosuggestions/zsh-autosuggestions.zsh
