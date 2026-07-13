FROM debian:sid
ARG LLVM_VERSION
RUN <<DONE
	set -eux

	# redis >=8.2 or whatever
	apt update
	apt install -y curl gpg
	curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
	chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
	echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb trixie main" > /etc/apt/sources.list.d/redis.list

	# Prerequisites & tools. Mostly for the pathfinder build.
	apt update
	apt install -y \
		build-essential \
		clang-$LLVM_VERSION \
		clang-format-$LLVM_VERSION \
		clang-tidy-$LLVM_VERSION \
		clangd-$LLVM_VERSION \
		cmake \
		curl \
		entr \
		git \
		jq \
		libboost-all-dev \
		libglib2.0-dev \
		lld-$LLVM_VERSION \
		lldb-$LLVM_VERSION \
		locales-all \
		man \
		ninja-build \
		pkg-config \
		python3 \
		redis \
		vim \
		yq \
	;

	# Link clang-N binaries and libraries to system paths
	ln -fs /lib/"llvm-$LLVM_VERSION"/bin/* /usr/bin/
	ln -fs /usr/lib/"llvm-$LLVM_VERSION"/lib/clang/"$LLVM_VERSION"/lib/linux/* "/lib/$(uname -m)-linux-gnu/"

	# Fix broken libc++ std manifest
	ln -s "/lib/llvm-$LLVM_VERSION/share/libc++" /lib/share

	# By the way if you are reading this you can automatically import dotfiles. So like, I have all my
	# local aliases, gitignore, bash_profile, and so on setup in the Docker container.
	# https://code.visualstudio.com/docs/devcontainers/containers#_personalizing-with-dotfile-repositories
DONE
EXPOSE 21025/tcp
