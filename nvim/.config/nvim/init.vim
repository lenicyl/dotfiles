" Vim-Plug Config
call plug#begin()
        Plug 'catppuccin/nvim', { 'as': 'catppuccin' }
        Plug 'plasticboy/vim-markdown'
call plug#end()


" General
colorscheme catppuccin-mocha
set termguicolors
set t_Co=256


" Interface & behaviour
set title                       
set number
set cursorline
set mouse=a
set clipboard+=unnamedplus
        

" Tabulation and Indentation
set expandtab
set cindent
set tabstop=4
set shiftwidth=4
set softtabstop=4


" Undo and Backup
set undofile
set nobackup 
set nowritebackup
set noswapfile

