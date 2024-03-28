## XDG
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"

## Default Tools 
export EDITOR="helix"
export MANPAGER="sh -c 'col -bx | bat -l man -p'"
export MANROFFOPT="-c"

## GTK file picker fix
export GTK_USE_PORTAL=1

## ZSH
export ZDOTDIR="$XDG_CONFIG_HOME/zsh"
