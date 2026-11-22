# helm: set up the plugin, its companion tools and atlas.
# Run `make` (or `make help`) to see every target.

PLUGIN      := helm
MARKETPLACE := helm
GITHUB      := ninjanazal/helm
ID          := $(PLUGIN)@$(MARKETPLACE)
SP          := superpowers@claude-plugins-official

# Overridable:  make install SCOPE=user   ·   make install FROM=github
SCOPE ?= local
FROM  ?= here
SOURCE = $(if $(filter github,$(FROM)),$(GITHUB),$(CURDIR))
# atlas binary: per project (SCOPE=local) or per user (SCOPE=user).
BIN_local := $(CURDIR)/.atlas/bin
BIN_user  := $(HOME)/.local/bin
BIN        = $(BIN_$(SCOPE))
ATLAS      = $(firstword $(wildcard $(BIN_local)/atlas $(BIN_user)/atlas) atlas)

VERSION := $(shell sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' .claude-plugin/plugin.json | head -1)

# Colours, off when not a terminal or NO_COLOR is set.
ifeq ($(NO_COLOR)$(if $(MAKE_TERMOUT),tty),tty)
B := \033[1m
D := \033[2m
R := \033[0m
G := \033[32m
Y := \033[33m
C := \033[36m
M := \033[35m
endif

CLAUDE := claude
.DEFAULT_GOAL := help
.PHONY: plugin plugin-remove
.PHONY: help local global unlocal unglobal doctor install update remove enable disable \
        superpowers superpowers-remove herdr atlas atlas-remove index index-remove test validate check

# $(call step,<what>): a section header while a setup runs.
step = @printf '\n$(C)▸$(R) $(B)%s$(R)\n' "$(1)"
# $(call has,<plugin id>): true when the plugin is installed in any scope.
has = $(CLAUDE) plugin list 2>/dev/null | grep -q '$(1)'

##@ Setup (start here)

local: ## Everything for THIS project only: plugin, superpowers, atlas + index
	$(call step,helm plugin · this project)
	@$(MAKE) --no-print-directory install SCOPE=local
	$(call step,superpowers · this project)
	@$(MAKE) --no-print-directory superpowers SCOPE=local
	$(call step,herdr)
	@$(MAKE) --no-print-directory herdr
	$(call step,atlas · binary + MCP for this project)
	@$(MAKE) --no-print-directory atlas SCOPE=local
	$(call step,atlas · index $(CURDIR))
	@$(MAKE) --no-print-directory index DIR=$(CURDIR)
	@printf '\n$(G)✔ Local setup done.$(R) In Claude Code: $(B)/reload-plugins$(R), then $(B)/helm:deck$(R).\n'

global: ## Everything for EVERY project: plugin, superpowers, atlas (index per repo)
	$(call step,helm plugin · every project)
	@$(MAKE) --no-print-directory install SCOPE=user
	$(call step,superpowers · every project)
	@$(MAKE) --no-print-directory superpowers SCOPE=user
	$(call step,herdr)
	@$(MAKE) --no-print-directory herdr
	$(call step,atlas · binary + MCP for every project)
	@$(MAKE) --no-print-directory atlas SCOPE=user
	@printf '\n$(G)✔ Global setup done.$(R) In Claude Code: $(B)/reload-plugins$(R), then $(B)/helm:deck$(R).\n'
	@printf '  $(D)atlas indexes a repo the first time its tools are used, or run: make index DIR=<repo>$(R)\n'

unlocal: ## Undo `make local` (the index in .atlas/ stays; make index-remove drops it)
	-@$(MAKE) --no-print-directory remove superpowers-remove atlas-remove SCOPE=local
	@printf '$(G)✔$(R) Local setup removed. .atlas/ and .claude/ are left in place.\n'

unglobal: ## Undo `make global`
	-@$(MAKE) --no-print-directory remove superpowers-remove atlas-remove SCOPE=user
	@printf '$(G)✔$(R) Global setup removed.\n'

doctor: ## Show what is installed, where, and what to run next
	@printf '\n  $(B)helm doctor$(R)\n\n'
	@for p in '$(ID)' '$(SP)'; do \
	  s=$$($(CLAUDE) plugin list 2>/dev/null | grep -A3 "$$p" | sed -n 's/.*Scope: *//p' | sort -u | tr '\n' ' '); \
	  [ -n "$$s" ] && printf '  $(G)✔$(R) %-36s $(D)%s$(R)\n' "$$p" "$$s" || printf '  $(Y)○$(R) %-36s $(D)not installed$(R)\n' "$$p"; done
	@$(CLAUDE) plugin list 2>/dev/null | grep -A3 '$(SP)' | grep -q 'Status:.*enabled' || printf '  $(D)superpowers is off: helm skills skip their workflow steps. Add it: make superpowers SCOPE=local|user$(R)\n'
	@command -v herdr >/dev/null && printf '  $(G)✔$(R) %-36s $(D)%s$(R)\n' herdr "$$(herdr --version 2>/dev/null)" || printf '  $(Y)○$(R) %-36s $(D)not found (optional)$(R)\n' herdr
	@for sc in local user; do b=$$([ $$sc = local ] && echo '$(BIN_local)' || echo '$(BIN_user)'); \
	  [ -x $$b/atlas ] && printf '  $(G)✔$(R) %-36s $(D)%s$(R)\n' "atlas binary ($$sc)" "$$b/atlas" || printf '  $(D)○ %-36s make atlas SCOPE=%s$(R)\n' "atlas binary ($$sc)" $$sc; done
	@m=$$($(CLAUDE) mcp get atlas 2>/dev/null | sed -n 's/.*Scope: *//p' | head -1); [ -n "$$m" ] && printf '  $(G)✔$(R) %-36s $(D)%s$(R)\n' 'atlas MCP server' "$$m" || printf '  $(Y)○$(R) %-36s $(D)make atlas SCOPE=local|user$(R)\n' 'atlas MCP server'
	@[ -f .atlas/graph.db ] && printf '  $(G)✔$(R) %-36s $(D)%s$(R)\n' 'atlas index (this folder)' "$$($(ATLAS) stats 2>/dev/null | head -1)" || printf '  $(Y)○$(R) %-36s $(D)make index$(R)\n' 'atlas index (this folder)'
	@printf '\n'

##@ Pieces

plugin: install
plugin-remove: remove

install: ## Install the helm plugin (alias: plugin) (FROM=here|github, SCOPE=local|user)
	@if $(call has,$(ID)) && $(CLAUDE) plugin list 2>/dev/null | grep -A3 '$(ID)' | grep -q 'Scope: $(SCOPE)'; then \
	  printf '$(G)✔$(R) helm already installed ($(SCOPE))\n'; \
	else $(CLAUDE) plugin install $(PLUGIN) --marketplace $(SOURCE) --scope $(SCOPE) && printf '$(G)✔$(R) helm installed ($(SCOPE))\n'; fi

superpowers: ## Install superpowers (brainstorm → plan → TDD → review) (SCOPE=…)
	@if $(CLAUDE) plugin list 2>/dev/null | grep -A3 '$(SP)' | grep -q 'Scope: $(SCOPE)'; then \
	  printf '$(G)✔$(R) superpowers already installed ($(SCOPE))\n'; \
	else $(CLAUDE) plugin install $(SP) --scope $(SCOPE) && printf '$(G)✔$(R) superpowers installed ($(SCOPE))\n'; fi

superpowers-remove: ## Uninstall superpowers (SCOPE=…)
	@$(CLAUDE) plugin uninstall $(SP) --scope $(SCOPE) >/dev/null 2>&1 && printf '$(G)✔$(R) superpowers removed ($(SCOPE))\n' || printf '$(D)○ superpowers not installed at $(SCOPE) scope$(R)\n'

herdr: ## Check herdr (optional terminal multiplexer for agents)
	@command -v herdr >/dev/null && printf '$(G)✔$(R) herdr %s\n' "$$(herdr --version 2>/dev/null)" \
	  || printf '$(Y)○$(R) herdr not found; optional. Install it from its project page, then re-run.\n'

atlas: ## Install atlas + its MCP server (SCOPE=local: this project · user: every project)
	@command -v cargo >/dev/null || { printf '$(Y)○$(R) cargo not found: install Rust via rustup, then re-run.\n'; exit 1; }
	@cargo install --path atlas --root $(dir $(BIN)) --quiet --force
	@$(CLAUDE) mcp remove --scope $(SCOPE) atlas >/dev/null 2>&1 || true
	@$(CLAUDE) mcp add --scope $(SCOPE) atlas -- $(BIN)/atlas mcp >/dev/null
	@printf '$(G)✔$(R) atlas ($(SCOPE)) → $(BIN)/atlas, MCP server registered\n'

atlas-remove: ## Remove atlas's MCP server and binary for SCOPE (index stays)
	@$(CLAUDE) mcp remove --scope $(SCOPE) atlas >/dev/null 2>&1 && printf '$(G)✔$(R) MCP server "atlas" removed ($(SCOPE))\n' || printf '$(D)○ no atlas MCP server at $(SCOPE) scope$(R)\n'
	@if [ -x $(BIN)/atlas ]; then rm -f $(BIN)/atlas; printf '$(G)✔$(R) removed $(BIN)/atlas\n'; fi

index: ## Build or refresh the atlas index (DIR=<repo>, default here)
	@$(ATLAS) index --root $(or $(DIR),$(CURDIR))

index-remove: ## Delete the atlas index of DIR (default here); rebuilt on next use
	@rm -rf $(or $(DIR),$(CURDIR))/.atlas/graph.db* && printf '$(G)✔$(R) index removed\n'

update: ## Refresh the marketplace and update the plugin (SCOPE=…)
	@$(CLAUDE) plugin marketplace update $(MARKETPLACE)
	@$(CLAUDE) plugin update $(ID) --scope $(SCOPE)
	@printf '$(G)✔$(R) Updated. Run $(B)/reload-plugins$(R) to load it.\n'

remove: ## Uninstall the helm plugin (alias: plugin-remove) (SCOPE=…); files in .claude/ stay
	@$(CLAUDE) plugin uninstall $(ID) --scope $(SCOPE) >/dev/null 2>&1 && printf '$(G)✔$(R) helm removed ($(SCOPE))\n' || printf '$(D)○ helm not installed at $(SCOPE) scope$(R)\n'

enable: ## Turn an installed plugin on (SCOPE=…)
	@$(CLAUDE) plugin enable $(ID) --scope $(SCOPE)
	@printf '$(G)✔$(R) Enabled. Run $(B)/reload-plugins$(R) in Claude Code.\n'

disable: ## Turn the plugin off without uninstalling it (SCOPE=…)
	@$(CLAUDE) plugin disable $(ID) --scope $(SCOPE)

##@ Develop

test: ## Run the plugin tests and the atlas tests
	@$(CLAUDE) plugin test .
	@cargo test -q --manifest-path atlas/Cargo.toml 2>&1 | tail -2

validate: ## Check the plugin and marketplace manifests
	@$(CLAUDE) plugin validate .

check: validate test ## Validate, then test

##@ Help

help: ## Show this help
	@printf '\n  $(M)⎈ $(B)helm$(R) $(D)v$(VERSION) · Claude Code plugin + atlas$(R)\n'
	@printf '\n  $(B)Quick start$(R)\n'
	@printf '    $(C)make local$(R)    $(D)# set up everything for this project only$(R)\n'
	@printf '    $(C)make global$(R)   $(D)# set up everything for every project$(R)\n'
	@printf '    $(C)make doctor$(R)   $(D)# see what is installed and where$(R)\n'
	@awk 'BEGIN {FS = ":.*## "} \
		/^##@/ { printf "\n  $(B)%s$(R)\n", substr($$0, 5) } \
		/^[a-z-]+:.*## / { printf "    $(C)%-19s$(R) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\n  $(D)Every piece: make <piece> / make <piece>-remove, SCOPE=local (default) or user$(R)\n'
	@printf '  $(D)Options: SCOPE=local|user · FROM=here|github · DIR=<repo> · NO_COLOR=1$(R)\n\n'
