ZPLUGDIR="$HOME/.local/share/zsh"

[ ! -d $ZPLUGDIR/fsh ] && 
  git clone --depth 1 https://github.com/zdharma-continuum/fast-syntax-highlighting $ZPLUGDIR/fsh

[ ! -d $ZPLUGDIR/zsh-autosuggestions ] && 
  git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions $ZPLUGDIR/zsh-autosuggestions

autoload -Uz zcompare
for plug in $ZPLUGDIR/{fsh/fast-*~*zwc,zsh-autosuggestions/{zsh-autosuggestions.zsh,src/**/*.zsh}}; do
  zcompare $plug
done

source $ZPLUGDIR/fsh/fast-syntax-highlighting.plugin.zsh
source $ZPLUGDIR/zsh-autosuggestions/zsh-autosuggestions.zsh
