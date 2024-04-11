## Load Completion Stuff
ZCOMPCACHE="$HOME/.cache/zsh/zcompcache"
ZCOMPDUMP="$ZCOMPCACHE/zcompdump"
[ -d $ZCOMPCACHE ] || mkdir $ZCOMPCACHE

autoload -Uz compinit 
compinit -d $ZCOMPDUMP
_comp_options+=(globdots)

# Compile completion dump file
[ $ZCOMPDUMP.zwc -nt $ZCOMPDUMP ] || zcompile $ZCOMPDUMP

## Cache
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path $ZCOMPCACHE

zstyle ':completion:*' completer _extensions _complete _approximate                     # Define completers
zstyle ':completion:*:*:*:*:*' menu select                                              # Completion menu
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'                               # Case insensitive tab completion

## Completion Descriptions
zstyle ':completion:*:*:*:*:*' menu select
zstyle ':completion:*:matches' group yes
zstyle ':completion:*:options' description yes
zstyle ':completion:*:options' auto-description '%d'
zstyle ':completion:*:corrections' format '%F{green}-- %d (errors: %e) --%f'
zstyle ':completion:*:descriptions' format '%F{yellow}-- %d --%f'
zstyle ':completion:*:messages' format '%F{purple}-- %d --%f'
zstyle ':completion:*:warnings' format '%F{red}-- no matches found --%f'
zstyle ':completion:*' format '%F{yellow}-- %d --%f'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' verbose yes
