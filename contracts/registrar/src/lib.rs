#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Error, IntoVal, Symbol,
};

mod keys {
    pub const REGISTRY: &[u8] = b"REG_ADDR";
    pub const TLD: &[u8] = b"REG_TLD";
    pub const PARAMS: &[u8] = b"REG_PARM";
    pub const ADMIN: &[u8] = b"REG_ADMN";
    pub const COMM: &[u8] = b"REG_COMM";
}

fn default_params() -> RegistrarParams {
    RegistrarParams {
        min_label_len: 1,
        max_label_len: 63,
        commit_min_age_secs: 60,
        commit_max_age_secs: 86_400,
        renew_extension_secs: 31_536_000,
        grace_period_secs: 7_776_000,
    }
}

fn singleton_key(env: &Env, tag: &[u8]) -> Bytes {
    Bytes::from_slice(env, tag)
}

fn commitment_key(env: &Env, commitment: &BytesN<32>) -> Bytes {
    let mut key = Bytes::from_slice(env, keys::COMM);
    key.extend_from_array(&commitment.to_array());
    key
}

fn read_registry(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_tld(env: &Env) -> Bytes {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_admin(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_params(env: &Env) -> RegistrarParams {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn write_params(env: &Env, params: &RegistrarParams) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.set(&key, params);
}

fn write_registry(env: &Env, registry: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.set(&key, registry);
}

fn write_tld(env: &Env, tld: &Bytes) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.set(&key, tld);
}

fn write_admin(env: &Env, admin: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.set(&key, admin);
}

fn ensure_label_len_bounds(env: &Env, params: &RegistrarParams, len: u32) {
    if len < params.min_label_len || len > params.max_label_len {
        panic_with_error!(env, RegistrarError::InvalidLabel);
    }
}

fn validate_label(env: &Env, label: &Bytes) {
    let params = read_params(env);
    let len = label.len();
    ensure_label_len_bounds(env, &params, len);
    let last_idx = (len - 1) as usize;
    for (idx, b) in label.iter().enumerate() {
        match b {
            b'a'..=b'z' | b'0'..=b'9' => {}
            b'-' if idx != 0 && idx != last_idx => {}
            _ => panic_with_error!(env, RegistrarError::InvalidLabel),
        };
    }
}

fn validate_label_len(env: &Env, len: u32) {
    let params = read_params(env);
    ensure_label_len_bounds(env, &params, len);
}

fn compute_commitment(env: &Env, label: &Bytes, owner: &Address, secret: &Bytes) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(label);
    let owner_bytes = owner.clone().to_xdr(env);
    data.append(&owner_bytes);
    data.append(secret);
    env.crypto().sha256(&data).to_bytes()
}

fn fold_hash(env: &Env, parent: &BytesN<32>, label_hash: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::from_array(env, &parent.to_array());
    data.extend_from_array(&label_hash.to_array());
    env.crypto().sha256(&data).to_bytes()
}

fn compute_namehash(env: &Env, label: &Bytes) -> BytesN<32> {
    let tld = read_tld(env);
    let root = BytesN::<32>::from_array(env, &[0u8; 32]);
    let tld_hash = env.crypto().sha256(&tld).to_bytes();
    let node = fold_hash(env, &root, &tld_hash);
    let label_hash = env.crypto().sha256(label).to_bytes();
    fold_hash(env, &node, &label_hash)
}

fn commitment_info(env: &Env, commitment: &BytesN<32>) -> Option<CommitmentInfo> {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.get(&key)
}

fn store_commitment(env: &Env, commitment: &BytesN<32>, info: &CommitmentInfo) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.set(&key, info);
}

fn remove_commitment(env: &Env, commitment: &BytesN<32>) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.remove(&key);
}

fn ensure_initialized(env: &Env) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    if !storage.has(&key) {
        panic_with_error!(env, RegistrarError::NotInitialized);
    }
}

fn ensure_admin(env: &Env, caller: &Address) {
    let admin = read_admin(env);
    if admin != *caller {
        panic_with_error!(env, RegistrarError::NotAdmin);
    }
}

fn grace_expired(now: u64, expires_at: u64, grace: u64) -> bool {
    if now <= expires_at {
        return false;
    }
    let grace_end = expires_at.checked_add(grace).unwrap_or(u64::MAX);
    now > grace_end
}

mod registry_api {
    use super::*;

    pub fn set_owner(env: &Env, registry: &Address, namehash: &BytesN<32>, owner: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_owner"),
            (namehash, owner).into_val(env),
        );
    }

    pub fn set_resolver(env: &Env, registry: &Address, namehash: &BytesN<32>, resolver: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_resolver"),
            (namehash, resolver).into_val(env),
        );
    }

    pub fn renew(env: &Env, registry: &Address, namehash: &BytesN<32>) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "renew"),
            (namehash,).into_val(env),
        );
    }

    pub fn owner(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<Address> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<Address, Error>(&registry, &Symbol::new(env, "owner"), args)
        {
            Ok(Ok(address)) => Some(address),
            _ => None,
        }
    }

    pub fn expires(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<u64> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<u64, Error>(&registry, &Symbol::new(env, "expires"), args) {
            Ok(Ok(ts)) => Some(ts),
            _ => None,
        }
    }
}

/// Registrar contract for the `.stellar` namespace.
#[contract]
pub struct Registrar;

#[contracttype]
#[derive(Clone)]
pub struct RegistrarParams {
    pub min_label_len: u32,
    pub max_label_len: u32,
    pub commit_min_age_secs: u64,
    pub commit_max_age_secs: u64,
    pub renew_extension_secs: u64,
    pub grace_period_secs: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistrarError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAdmin = 3,
    NotOwner = 4,
    InvalidLabel = 5,
    CommitmentExists = 6,
    CommitmentMissing = 7,
    CommitmentTooFresh = 8,
    CommitmentTooOld = 9,
    NameNotAvailable = 10,
    ExpiryUnavailable = 11,
    InvalidParams = 12,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtCommitMade {
    pub commitment: BytesN<32>,
    pub at: u64,
    pub label_len: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRegistered {
    pub namehash: BytesN<32>,
    pub owner: Address,
    pub expires_at: u64,
    pub ts: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRenewed {
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone)]
struct CommitmentInfo {
    pub timestamp: u64,
    pub label_len: u32,
}

#[contractimpl]
impl Registrar {
    /// One-time initializer.
    pub fn init(env: Env, registry: Address, tld: Bytes, admin: Address) {
        let storage = env.storage().persistent();
        let key = singleton_key(&env, keys::REGISTRY);
        if storage.has(&key) {
            panic_with_error!(&env, RegistrarError::AlreadyInitialized);
        }
        if tld.is_empty() {
            panic_with_error!(&env, RegistrarError::InvalidLabel);
        }
        write_registry(&env, &registry);
        write_tld(&env, &tld);
        write_admin(&env, &admin);
        let params = default_params();
        write_params(&env, &params);
    }

    /// Record commitment timestamp for commit–reveal. `label_len` allows early validation
    /// without revealing the label itself on-chain.
    pub fn commit(env: Env, caller: Address, commitment: BytesN<32>, label_len: u32) {
        ensure_initialized(&env);
        caller.require_auth();
        validate_label_len(&env, label_len);
        let key = commitment_key(&env, &commitment);
        let storage = env.storage().persistent();
        if storage.has(&key) {
            panic_with_error!(&env, RegistrarError::CommitmentExists);
        }
        let ts = env.ledger().timestamp();
        let info = CommitmentInfo {
            timestamp: ts,
            label_len,
        };
        store_commitment(&env, &commitment, &info);
        env.events().publish(
            (Symbol::new(&env, "commit_made"), commitment.clone()),
            EvtCommitMade {
                commitment,
                at: ts,
                label_len,
            },
        );
    }

    /// Finalize name registration after commitment matures.
    #[allow(clippy::too_many_arguments)]
    pub fn register(
        env: Env,
        caller: Address,
        label: Bytes,
        owner: Address,
        secret: Bytes,
        resolver: Option<Address>,
    ) -> BytesN<32> {
        ensure_initialized(&env);
        caller.require_auth();
        validate_label(&env, &label);

        let params = read_params(&env);
        let registry = read_registry(&env);
        let now = env.ledger().timestamp();
        let commitment = compute_commitment(&env, &label, &owner, &secret);

        let stored = commitment_info(&env, &commitment)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::CommitmentMissing));
        let age = now.saturating_sub(stored.timestamp);
        if age < params.commit_min_age_secs {
            panic_with_error!(&env, RegistrarError::CommitmentTooFresh);
        }
        if age > params.commit_max_age_secs {
            panic_with_error!(&env, RegistrarError::CommitmentTooOld);
        }
        if label.len() != stored.label_len {
            panic_with_error!(&env, RegistrarError::InvalidLabel);
        }
        if !Self::available(env.clone(), label.clone()) {
            panic_with_error!(&env, RegistrarError::NameNotAvailable);
        }

        let namehash = compute_namehash(&env, &label);
        let registrar_addr = env.current_contract_address();

        // Registrar-first ownership: ensures Registry calls requiring owner auth succeed.
        registry_api::set_owner(&env, &registry, &namehash, &registrar_addr);
        if let Some(resolver_addr) = resolver.as_ref() {
            registry_api::set_resolver(&env, &registry, &namehash, resolver_addr);
        }
        registry_api::renew(&env, &registry, &namehash);
        registry_api::set_owner(&env, &registry, &namehash, &owner);

        // Delete commitment after successful registration to prevent premature burn on failed attempts.
        remove_commitment(&env, &commitment);

        let expires_at = registry_api::expires(&env, &registry, &namehash).unwrap_or_else(|| {
            now.checked_add(params.renew_extension_secs)
                .unwrap_or(u64::MAX)
        });
        let ts = env.ledger().timestamp();

        env.events().publish(
            (Symbol::new(&env, "name_registered"), namehash.clone()),
            EvtNameRegistered {
                namehash: namehash.clone(),
                owner: owner.clone(),
                expires_at,
                ts,
            },
        );

        namehash
    }

    /// Extend an existing registration's expiry.
    pub fn renew(env: Env, caller: Address, label: Bytes) {
        ensure_initialized(&env);
        caller.require_auth();
        validate_label(&env, &label);

        let registry = read_registry(&env);
        let namehash = compute_namehash(&env, &label);
        let owner = registry_api::owner(&env, &registry, &namehash)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::NotOwner));
        if owner != caller {
            panic_with_error!(&env, RegistrarError::NotOwner);
        }

        registry_api::renew(&env, &registry, &namehash);
        let expires_at = registry_api::expires(&env, &registry, &namehash)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::ExpiryUnavailable));

        env.events().publish(
            (Symbol::new(&env, "name_renewed"), namehash.clone()),
            EvtNameRenewed {
                namehash,
                expires_at,
            },
        );
    }

    /// Return whether the label is currently available.
    pub fn available(env: Env, label: Bytes) -> bool {
        if label.is_empty() {
            return false;
        }
        if !env
            .storage()
            .persistent()
            .has(&singleton_key(&env, keys::REGISTRY))
        {
            return false;
        }
        let params = read_params(&env);
        if label.len() < params.min_label_len || label.len() > params.max_label_len {
            return false;
        }
        let registry = read_registry(&env);
        let namehash = compute_namehash(&env, &label);

        let owner = registry_api::owner(&env, &registry, &namehash);
        if owner.is_none() {
            return true;
        }

        let expires_at = registry_api::expires(&env, &registry, &namehash);
        match expires_at {
            Some(ts) => {
                let now = env.ledger().timestamp();
                grace_expired(now, ts, params.grace_period_secs)
            }
            None => false,
        }
    }

    /// Update registrar parameters (admin only).
    pub fn set_params(env: Env, caller: Address, params: RegistrarParams) {
        ensure_initialized(&env);
        caller.require_auth();
        ensure_admin(&env, &caller);
        if params.min_label_len == 0
            || params.min_label_len > params.max_label_len
            || params.max_label_len > 63
            || params.commit_min_age_secs == 0
            || params.commit_min_age_secs > params.commit_max_age_secs
            || params.renew_extension_secs == 0
            || params.grace_period_secs == 0
        {
            panic_with_error!(&env, RegistrarError::InvalidParams);
        }
        write_params(&env, &params);
    }

    /// Fetch current registrar parameters.
    pub fn params(env: Env) -> RegistrarParams {
        ensure_initialized(&env);
        read_params(&env)
    }

    /// Stored registry address helper.
    pub fn registry(env: Env) -> Address {
        ensure_initialized(&env);
        read_registry(&env)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, contracttype,
        testutils::{Address as _, Events, Ledger},
        Address, Bytes, BytesN, Env, Symbol, TryFromVal,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    const MOCK_RENEW_EXTENSION: u64 = 31_536_000;

    #[contract]
    pub struct MockRegistry;

    #[contracttype]
    #[derive(Clone)]
    enum MockRegistryKey {
        Owner(BytesN<32>),
        Resolver(BytesN<32>),
        Expires(BytesN<32>),
    }

    #[contractimpl]
    impl MockRegistry {
        pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash.clone()))
                .unwrap_or_else(|| panic!("owner not set"))
        }

        pub fn set_owner(env: Env, namehash: BytesN<32>, owner: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Owner(namehash), &owner);
        }

        pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Resolver(namehash), &resolver);
        }

        pub fn resolver(env: Env, namehash: BytesN<32>) -> Option<Address> {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Resolver(namehash))
        }

        pub fn renew(env: Env, namehash: BytesN<32>) {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash.clone()))
                .unwrap_or_else(|| panic!("owner not set"));
            owner.require_auth();
            let now = env.ledger().timestamp();
            let current = env
                .storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or(0u64);
            let base = if current > now { current } else { now };
            let new_expiry = base.checked_add(MOCK_RENEW_EXTENSION).unwrap_or(u64::MAX);
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Expires(namehash), &new_expiry);
        }

        pub fn expires(env: Env, namehash: BytesN<32>) -> u64 {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or_else(|| panic!("expiry not set"))
        }

        pub fn clear_expiry(env: Env, namehash: BytesN<32>) {
            env.storage()
                .persistent()
                .remove(&MockRegistryKey::Expires(namehash));
        }
    }

    #[contract]
    pub struct MockRegistryOwnerAuth;

    #[contractimpl]
    impl MockRegistryOwnerAuth {
        pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash.clone()))
                .unwrap_or_else(|| panic!("owner not set"))
        }

        pub fn set_owner(env: Env, namehash: BytesN<32>, owner: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Owner(namehash), &owner);
        }

        pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Resolver(namehash), &resolver);
        }

        pub fn resolver(env: Env, namehash: BytesN<32>) -> Option<Address> {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Resolver(namehash))
        }

        pub fn renew(env: Env, namehash: BytesN<32>) {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash.clone()))
                .unwrap_or_else(|| panic!("owner not set"));
            owner.require_auth();
            let now = env.ledger().timestamp();
            let current = env
                .storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or(0u64);
            let base = if current > now { current } else { now };
            let new_expiry = base.checked_add(MOCK_RENEW_EXTENSION).unwrap_or(u64::MAX);
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Expires(namehash), &new_expiry);
        }

        pub fn expires(env: Env, namehash: BytesN<32>) -> u64 {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or_else(|| panic!("expiry not set"))
        }
    }

    fn setup_env() -> (Env, Address, Address, Address) {
        let env = Env::default();
        let registry_id = env.register(MockRegistry, ());
        let registrar_id = env.register(Registrar, ());
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let admin = Address::generate(&env);
        let tld = Bytes::from_slice(&env, b"stellar");
        registrar_client.init(&registry_id, &tld, &admin);
        env.mock_all_auths();
        (env, registry_id, registrar_id, admin)
    }

    fn make_label(env: &Env, text: &str) -> Bytes {
        Bytes::from_slice(env, text.as_bytes())
    }

    fn make_bytes(env: &Env, data: &[u8]) -> Bytes {
        Bytes::from_slice(env, data)
    }

    fn make_commitment(env: &Env, label: &Bytes, owner: &Address, secret: &Bytes) -> BytesN<32> {
        super::compute_commitment(env, label, owner, secret)
    }

    fn expected_namehash(env: &Env, label: &Bytes) -> BytesN<32> {
        let tld = Bytes::from_slice(env, b"stellar");
        let root = BytesN::<32>::from_array(env, &[0u8; 32]);
        let tld_hash = env.crypto().sha256(&tld).to_bytes();
        let node = super::fold_hash(env, &root, &tld_hash);
        let label_hash = env.crypto().sha256(label).to_bytes();
        super::fold_hash(env, &node, &label_hash)
    }

    fn register_name(
        env: &Env,
        registry_client: &MockRegistryClient,
        registrar_client: &RegistrarClient,
        caller: &Address,
        label: &Bytes,
        owner: &Address,
        secret: &Bytes,
        resolver: Option<&Address>,
    ) -> BytesN<32> {
        let commitment = make_commitment(env, label, owner, secret);
        let label_len = label.len();
        registrar_client.commit(caller, &commitment, &label_len);
        let params = registrar_client.params();
        let now = env.ledger().timestamp();
        env.ledger().set_timestamp(now + params.commit_min_age_secs);
        let resolver_arg = resolver.cloned();
        let result = registrar_client.register(caller, label, owner, secret, &resolver_arg);
        let namehash = expected_namehash(env, label);
        assert_eq!(result, namehash);
        let stored_owner = registry_client.owner(&namehash);
        assert_eq!(stored_owner, *owner);
        namehash
    }

    fn commitment_exists(env: &Env, registrar_id: &Address, commitment: &BytesN<32>) -> bool {
        env.as_contract(registrar_id, || super::commitment_info(env, commitment))
            .is_some()
    }

    #[test]
    fn init_only_once() {
        let (env, registry_id, registrar_id, admin) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let tld = Bytes::from_slice(&env, b"stellar");
        let second = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.init(&registry_id, &tld, &admin);
        }));
        assert!(second.is_err());
    }

    #[test]
    fn commit_register_happy_path() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(1_000);
        let caller = Address::generate(&env);
        let owner = Address::generate(&env);
        let resolver = Address::generate(&env);
        let label = make_label(&env, "alice");
        let secret = make_bytes(&env, b"secret");

        let commitment = make_commitment(&env, &label, &owner, &secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &commitment, &label_len);

        let params = registrar_client.params();
        env.ledger()
            .set_timestamp(1_000 + params.commit_min_age_secs);
        let resolver_arg = Some(resolver.clone());
        let expected_ts = env.ledger().timestamp();
        let namehash = registrar_client.register(&caller, &label, &owner, &secret, &resolver_arg);
        let events = env.events().all();

        let stored_owner = registry_client.owner(&namehash);
        assert_eq!(stored_owner, owner);

        let expires = registry_client.expires(&namehash);
        assert_eq!(
            expires,
            env.ledger()
                .timestamp()
                .checked_add(MOCK_RENEW_EXTENSION)
                .unwrap()
        );

        let stored_resolver = registry_client.resolver(&namehash).unwrap();
        assert_eq!(stored_resolver, resolver);
        let mut found = false;
        for idx in 0..events.len() {
            let (contract_id, topics, data) = events.get(idx).unwrap();
            if contract_id != registrar_id {
                continue;
            }
            let symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
            if symbol != Symbol::new(&env, "name_registered") {
                continue;
            }
            let evt = EvtNameRegistered::try_from_val(&env, &data).unwrap();
            assert_eq!(evt.namehash, namehash);
            assert_eq!(evt.owner, owner);
            assert_eq!(evt.expires_at, expires);
            assert_eq!(evt.ts, expected_ts);
            found = true;
        }
        assert!(found, "expected name_registered event");
    }

    #[test]
    fn register_without_resolver_succeeds() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(1_500);

        let caller = Address::generate(&env);
        let owner = Address::generate(&env);
        let label = make_label(&env, "noresolver");
        let secret = make_bytes(&env, b"none");

        let commitment = make_commitment(&env, &label, &owner, &secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &commitment, &label_len);
        let params = registrar_client.params();
        env.ledger()
            .set_timestamp(1_500 + params.commit_min_age_secs);
        let none_resolver: Option<Address> = None;
        let namehash = registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);

        assert_eq!(registry_client.owner(&namehash), owner);
        assert!(registry_client.resolver(&namehash).is_none());
    }

    #[test]
    fn register_handles_registry_owner_auth_requirements() {
        let env = Env::default();
        let registry_id = env.register(MockRegistryOwnerAuth, ());
        let registrar_id = env.register(Registrar, ());
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let admin = Address::generate(&env);
        let tld = Bytes::from_slice(&env, b"stellar");
        registrar_client.init(&registry_id, &tld, &admin);
        env.mock_all_auths();
        env.ledger().set_timestamp(2_000);

        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "ownerflow");
        let secret = make_bytes(&env, b"flow_secret");
        let commitment = make_commitment(&env, &label, &owner, &secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &commitment, &label_len);

        let params = registrar_client.params();
        env.ledger()
            .set_timestamp(2_000 + params.commit_min_age_secs);
        let none_resolver: Option<Address> = None;
        let namehash = registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);

        let registry_client = MockRegistryOwnerAuthClient::new(&env, &registry_id);
        assert_eq!(registry_client.owner(&namehash), owner);
    }

    #[test]
    fn commitment_window_invalid() {
        let (env, _registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "fresh");
        let secret = make_bytes(&env, b"123");
        let commitment = make_commitment(&env, &label, &owner, &secret);
        let label_len = label.len();
        let none_resolver: Option<Address> = None;
        let without_commit = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);
        }));
        assert!(without_commit.is_err());

        registrar_client.commit(&caller, &commitment, &label_len);
        let too_fresh = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);
        }));
        assert!(too_fresh.is_err());

        env.ledger()
            .set_timestamp(registrar_client.params().commit_max_age_secs + 10);
        let too_old = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);
        }));
        assert!(too_old.is_err());
    }

    #[test]
    fn availability_cycles_through_lifecycle() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(5_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "cycle");
        let secret = make_bytes(&env, b"cycle_secret");

        assert!(registrar_client.available(&label));

        let commitment = make_commitment(&env, &label, &owner, &secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &commitment, &label_len);
        env.ledger()
            .set_timestamp(5_000 + registrar_client.params().commit_min_age_secs);
        let none_resolver: Option<Address> = None;
        let namehash = registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);
        assert!(!registrar_client.available(&label));

        let expires = registry_client.expires(&namehash);
        env.ledger()
            .set_timestamp(expires + registrar_client.params().grace_period_secs + 1);
        assert!(registrar_client.available(&label));
    }

    #[test]
    fn unavailable_when_in_grace() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(10_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "grace");
        let secret = make_bytes(&env, b"abc");

        let namehash = register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );
        assert!(!registrar_client.available(&label));

        let expires = registry_client.expires(&namehash);
        env.ledger()
            .set_timestamp(expires + registrar_client.params().grace_period_secs);
        assert!(!registrar_client.available(&label));
    }

    #[test]
    fn unavailable_when_owner_missing_expiry() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(11_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "noexpiry");
        let secret = make_bytes(&env, b"missing_expiry");

        let namehash = register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );
        assert!(!registrar_client.available(&label));

        registry_client.clear_expiry(&namehash);
        assert!(
            !registrar_client.available(&label),
            "ownership without expiry must remain unavailable"
        );
    }

    #[test]
    fn register_when_unavailable_fails() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(12_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "taken");
        let secret = make_bytes(&env, b"secret");

        register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );

        let new_owner = Address::generate(&env);
        let new_secret = make_bytes(&env, b"secret2");
        let commitment = make_commitment(&env, &label, &new_owner, &new_secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &commitment, &label_len);
        env.ledger()
            .set_timestamp(12_000 + registrar_client.params().commit_min_age_secs);

        let none_resolver: Option<Address> = None;
        let attempt = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &label, &new_owner, &new_secret, &none_resolver);
        }));
        assert!(attempt.is_err());
    }

    #[test]
    fn commitment_deleted_only_after_successful_registration() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(14_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "locked");
        let secret = make_bytes(&env, b"lock_secret");

        register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );

        env.ledger().set_timestamp(15_000);
        let challenger = Address::generate(&env);
        let challenger_secret = make_bytes(&env, b"challenge");
        let challenger_commitment = make_commitment(&env, &label, &challenger, &challenger_secret);
        let label_len = label.len();
        registrar_client.commit(&caller, &challenger_commitment, &label_len);
        let params = registrar_client.params();
        env.ledger()
            .set_timestamp(15_000 + params.commit_min_age_secs);
        let none_resolver: Option<Address> = None;
        let attempt = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(
                &caller,
                &label,
                &challenger,
                &challenger_secret,
                &none_resolver,
            );
        }));
        assert!(attempt.is_err());
        assert!(
            commitment_exists(&env, &registrar_id, &challenger_commitment),
            "commitment must remain after failed registration"
        );

        let fresh_label = make_label(&env, "freshpolicy");
        let fresh_secret = make_bytes(&env, b"fresh_secret");
        let fresh_commitment = make_commitment(&env, &fresh_label, &owner, &fresh_secret);
        let fresh_len = fresh_label.len();
        registrar_client.commit(&caller, &fresh_commitment, &fresh_len);
        env.ledger()
            .set_timestamp(15_000 + 2 * params.commit_min_age_secs);
        registrar_client.register(&caller, &fresh_label, &owner, &fresh_secret, &none_resolver);
        assert!(
            !commitment_exists(&env, &registrar_id, &fresh_commitment),
            "commitment must be removed after successful registration"
        );
    }

    #[test]
    fn renew_happy_path() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(20_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "renew");
        let secret = make_bytes(&env, b"renew");

        let namehash = register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );
        let before = registry_client.expires(&namehash);

        env.ledger().set_timestamp(before + 1);
        registrar_client.renew(&caller, &label);
        let events = env.events().all();
        let after = registry_client.expires(&namehash);
        assert!(after > before);

        let mut found = false;
        for idx in 0..events.len() {
            let (contract_id, topics, data) = events.get(idx).unwrap();
            if contract_id != registrar_id {
                continue;
            }
            let symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
            if symbol != Symbol::new(&env, "name_renewed") {
                continue;
            }
            let evt = EvtNameRenewed::try_from_val(&env, &data).unwrap();
            assert_eq!(evt.namehash, namehash);
            assert_eq!(evt.expires_at, after);
            found = true;
            break;
        }
        assert!(found, "expected name_renewed event");
    }

    #[test]
    fn renew_not_owner_rejected() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(30_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "guard");
        let secret = make_bytes(&env, b"guard");
        register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );

        let attacker = Address::generate(&env);
        let attempt = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.renew(&attacker, &label);
        }));
        assert!(attempt.is_err());
    }

    #[test]
    fn invalid_label_rejected() {
        let (env, _registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let secret = make_bytes(&env, b"x");
        let empty_label = Bytes::from_slice(&env, b"");
        let none_resolver: Option<Address> = None;
        let attempt = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &empty_label, &owner, &secret, &none_resolver);
        }));
        assert!(attempt.is_err());
    }

    #[test]
    fn label_character_validation() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        env.ledger().set_timestamp(45_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let secret = make_bytes(&env, b"validate");
        let none_resolver: Option<Address> = None;

        let invalid_label = Bytes::from_slice(&env, b"Bad!");
        let leading_hyphen = Bytes::from_slice(&env, b"-lead");
        let trailing_hyphen = Bytes::from_slice(&env, b"trail-");
        for label in [&invalid_label, &leading_hyphen, &trailing_hyphen] {
            let attempt = catch_unwind(AssertUnwindSafe(|| {
                registrar_client.register(&caller, label, &owner, &secret, &none_resolver);
            }));
            assert!(
                attempt.is_err(),
                "invalid label {:?} must be rejected",
                label
            );
        }

        let valid_label = make_label(&env, "abc-123");
        let commitment = make_commitment(&env, &valid_label, &owner, &secret);
        let label_len = valid_label.len();
        registrar_client.commit(&caller, &commitment, &label_len);
        let params = registrar_client.params();
        env.ledger()
            .set_timestamp(45_000 + params.commit_min_age_secs);
        let namehash =
            registrar_client.register(&caller, &valid_label, &owner, &secret, &none_resolver);

        let registry_client = MockRegistryClient::new(&env, &registry_id);
        assert_eq!(registry_client.owner(&namehash), owner);
    }

    #[test]
    fn commitment_replay_disallowed() {
        let (env, registry_id, registrar_id, _) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let registry_client = MockRegistryClient::new(&env, &registry_id);
        env.ledger().set_timestamp(40_000);
        let caller = Address::generate(&env);
        let owner = caller.clone();
        let label = make_label(&env, "single");
        let secret = make_bytes(&env, b"s1");

        env.ledger().set_timestamp(40_000);
        register_name(
            &env,
            &registry_client,
            &registrar_client,
            &caller,
            &label,
            &owner,
            &secret,
            None,
        );

        let none_resolver: Option<Address> = None;
        let replay = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.register(&caller, &label, &owner, &secret, &none_resolver);
        }));
        assert!(replay.is_err());
    }
}
